//! Read-only bridge for the Codex VS Code extension.
//!
//! The VS Code extension owns the app-server stdio connection, so another
//! extension cannot subscribe to it directly. Codex nevertheless records the
//! app-server lifecycle in its local SQLite diagnostics database. This module
//! observes only the two lifecycle labels (`turn/started` and
//! `turn/completed`) and the active VS Code thread's workspace path. It never
//! reads prompt, response, tool, or file content.

use rusqlite::{params, Connection, OpenFlags};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use crate::lease;
use crate::platform::is_path_in_workspace;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const LEASE_CHECK_TICKS: u32 = 20;
const OUTGOING_MESSAGE_TARGET: &str = "codex_app_server::outgoing_message";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LifecycleEvent {
    Started,
    Completed,
}

fn lifecycle_event(body: &str) -> Option<LifecycleEvent> {
    if body.starts_with("app-server event: turn/started ") {
        Some(LifecycleEvent::Started)
    } else if body.starts_with("app-server event: turn/completed ") {
        Some(LifecycleEvent::Completed)
    } else {
        None
    }
}

fn codex_home() -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
}

fn newest_log_database(home: &Path) -> Option<PathBuf> {
    fs::read_dir(home)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with("logs_") && name.ends_with(".sqlite")
                })
        })
        .max_by_key(|path| path.metadata().and_then(|metadata| metadata.modified()).ok())
}

fn open_read_only(path: &Path) -> rusqlite::Result<Connection> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    connection.busy_timeout(Duration::from_millis(100))?;
    Ok(connection)
}

fn latest_log_id(log_database: &Path) -> Option<i64> {
    let connection = open_read_only(log_database).ok()?;
    connection
        .query_row("SELECT COALESCE(MAX(id), 0) FROM logs", [], |row| row.get(0))
        .ok()
}

fn lifecycle_events_after(log_database: &Path, last_id: i64) -> Option<Vec<(i64, LifecycleEvent)>> {
    let connection = open_read_only(log_database).ok()?;
    let mut statement = connection
        .prepare(
            "SELECT id, feedback_log_body
             FROM logs
             WHERE id > ?1 AND target = ?2
             ORDER BY id ASC",
        )
        .ok()?;
    let rows = statement
        .query_map(params![last_id, OUTGOING_MESSAGE_TARGET], |row| {
            let id: i64 = row.get(0)?;
            let body: Option<String> = row.get(1)?;
            Ok((id, body))
        })
        .ok()?;

    let mut events = Vec::new();
    for row in rows.flatten() {
        let (id, body) = row;
        if let Some(event) = body.as_deref().and_then(lifecycle_event) {
            events.push((id, event));
        }
    }
    Some(events)
}

fn normalize_codex_path(path: &str) -> String {
    #[cfg(windows)]
    {
        path.strip_prefix(r"\\?\").unwrap_or(path).to_owned()
    }
    #[cfg(not(windows))]
    {
        path.to_owned()
    }
}

fn latest_vscode_thread_cwd(home: &Path) -> Option<(String, String)> {
    let state_database = newest_state_database(home)?;
    let connection = open_read_only(&state_database).ok()?;
    connection
        .query_row(
            "SELECT id, cwd
             FROM threads
             WHERE source = 'vscode' AND archived = 0
             ORDER BY COALESCE(updated_at_ms, updated_at) DESC
             LIMIT 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok()
        .map(|(id, cwd)| (id, normalize_codex_path(&cwd)))
}

fn newest_state_database(home: &Path) -> Option<PathBuf> {
    fs::read_dir(home)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("state_") && name.ends_with(".sqlite"))
        })
        .max_by_key(|path| path.metadata().and_then(|metadata| metadata.modified()).ok())
}

fn belongs_to_workspace(thread_cwd: &str, workspace: &str) -> bool {
    let thread_path = PathBuf::from(thread_cwd);
    let workspace_path = PathBuf::from(workspace);
    is_path_in_workspace(&thread_path, &workspace_path)
        || is_path_in_workspace(&workspace_path, &thread_path)
}

/// Watch Codex's local app-server diagnostics until this VS Code workspace
/// lease expires. The watcher establishes its initial log cursor at launch so
/// historical turns cannot open artwork.
pub fn watch<Start, Stop>(workspace: &str, mut on_start: Start, mut on_stop: Stop)
where
    Start: FnMut(String, String),
    Stop: FnMut(String),
{
    let Some(home) = codex_home() else { return };
    let Some(log_database) = newest_log_database(&home) else { return };
    let Some(mut last_id) = latest_log_id(&log_database) else { return };
    let mut active_session: Option<String> = None;
    let mut ticks_since_lease_check = LEASE_CHECK_TICKS;

    loop {
        ticks_since_lease_check += 1;
        if ticks_since_lease_check >= LEASE_CHECK_TICKS {
            ticks_since_lease_check = 0;
            let now_ms = chrono::Utc::now().timestamp_millis();
            if lease::find_matching_lease(workspace, now_ms).ok().flatten().is_none() {
                return;
            }
        }

        if let Some(events) = lifecycle_events_after(&log_database, last_id) {
            for (id, event) in events {
                last_id = last_id.max(id);
                match event {
                    LifecycleEvent::Started => {
                        if let Some((thread_id, cwd)) = latest_vscode_thread_cwd(&home) {
                            if belongs_to_workspace(&cwd, workspace) {
                                on_start(thread_id.clone(), cwd);
                                active_session = Some(thread_id);
                            }
                        }
                    }
                    LifecycleEvent::Completed => {
                        if let Some(session_id) = active_session.take() {
                            on_stop(session_id);
                        }
                    }
                }
            }
        }

        thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_only_turn_lifecycle_messages() {
        assert_eq!(
            lifecycle_event("app-server event: turn/started targeted_connections=1"),
            Some(LifecycleEvent::Started)
        );
        assert_eq!(
            lifecycle_event("app-server event: turn/completed targeted_connections=1"),
            Some(LifecycleEvent::Completed)
        );
        assert_eq!(
            lifecycle_event("app-server event: turn/diff/updated targeted_connections=1"),
            None
        );
    }

    #[test]
    fn matches_workspace_boundary() {
        assert!(belongs_to_workspace("C:\\dev\\artwait", "C:\\dev\\artwait"));
        assert!(!belongs_to_workspace("C:\\dev\\artwait-next", "C:\\dev\\artwait"));
    }

    #[cfg(windows)]
    #[test]
    fn strips_windows_extended_path_prefix() {
        assert_eq!(normalize_codex_path(r"\\?\C:\\dev\\artwait"), r"C:\\dev\\artwait");
    }
}
