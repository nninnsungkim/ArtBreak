//! Read-only lifecycle bridge for Claude Code.
//!
//! Claude Code writes the same append-only transcript format for terminal
//! sessions and its VS Code chat integration. This watcher reads only record
//! type, session ID, workspace path, and completion reason; prompt and model
//! content are deliberately ignored.

use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use crate::lease;
use crate::platform::is_path_in_workspace;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const LEASE_CHECK_TICKS: u32 = 20;

#[derive(Debug, Deserialize)]
struct TranscriptRecord {
    #[serde(rename = "type")]
    record_type: String,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(rename = "isSidechain", default)]
    is_sidechain: bool,
    #[serde(default)]
    message: Option<TranscriptMessage>,
}

#[derive(Debug, Deserialize)]
struct TranscriptMessage {
    role: Option<String>,
    #[serde(rename = "stop_reason")]
    stop_reason: Option<String>,
}

fn claude_home() -> Option<PathBuf> {
    std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".claude")))
}

fn transcript_files(home: &Path) -> Vec<PathBuf> {
    let projects = home.join("projects");
    let mut files = Vec::new();
    let Ok(project_entries) = fs::read_dir(projects) else { return files };

    for project in project_entries.flatten() {
        let path = project.path();
        if path.extension().and_then(|extension| extension.to_str()) == Some("jsonl") {
            files.push(path);
            continue;
        }
        let Ok(entries) = fs::read_dir(path) else { continue };
        for entry in entries.flatten() {
            let transcript = entry.path();
            if transcript.extension().and_then(|extension| extension.to_str()) == Some("jsonl") {
                files.push(transcript);
            }
        }
    }
    files
}

fn initial_cursors(home: &Path) -> HashMap<PathBuf, u64> {
    transcript_files(home)
        .into_iter()
        .filter_map(|path| Some((path.clone(), path.metadata().ok()?.len())))
        .collect()
}

fn appended_records(path: &Path, offset: u64) -> Option<(u64, Vec<TranscriptRecord>)> {
    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    let start = if file_len < offset { 0 } else { offset };
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut reader = BufReader::new(file);
    let mut next_offset = start;
    let mut records = Vec::new();

    loop {
        let mut line = String::new();
        let bytes_read = reader.read_line(&mut line).ok()?;
        if bytes_read == 0 { break }
        // A process can be observed between a write and its trailing newline.
        // Keep that line for the next poll rather than silently dropping it.
        if !line.ends_with('\n') { break }
        next_offset += bytes_read as u64;
        if let Ok(record) = serde_json::from_str::<TranscriptRecord>(&line) {
            records.push(record);
        }
    }

    Some((next_offset, records))
}

fn is_user_prompt(record: &TranscriptRecord) -> bool {
    record.record_type == "user"
        && !record.is_sidechain
        && record.message.as_ref().and_then(|message| message.role.as_deref()) == Some("user")
        && record.cwd.is_some()
        && record.session_id.is_some()
}

fn is_turn_complete(record: &TranscriptRecord) -> bool {
    if record.record_type != "assistant" || record.session_id.is_none() {
        return false;
    }

    let Some(message) = record.message.as_ref() else { return false };
    if message.role.as_deref() != Some("assistant") {
        return false;
    }

    // Accept any stop_reason except "tool_use" (which indicates a tool step, not turn completion)
    match message.stop_reason.as_deref() {
        Some("tool_use") => false,
        Some(_) => true,
        None => false,
    }
}

fn belongs_to_workspace(cwd: &str, workspace: &str) -> bool {
    let cwd = PathBuf::from(cwd);
    let workspace = PathBuf::from(workspace);
    is_path_in_workspace(&cwd, &workspace) || is_path_in_workspace(&workspace, &cwd)
}

/// Watches new Claude Code transcript records until this VS Code workspace
/// lease expires. Existing transcript content is cursor-skipped at startup,
/// ensuring only prompts sent after ArtBreak activates can open a window.
pub fn watch<Start, Stop>(workspace: &str, mut on_start: Start, mut on_stop: Stop)
where
    Start: FnMut(String, String),
    Stop: FnMut(String),
{
    let Some(home) = claude_home() else { return };
    let mut cursors = initial_cursors(&home);
    let mut active_sessions = HashSet::new();
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

        for path in transcript_files(&home) {
            // Initial cursors skip old history. A file first created while we
            // are watching must start at byte zero so its first prompt is not
            // lost before the next polling tick.
            let offset = *cursors.entry(path.clone()).or_insert(0);
            let Some((next_offset, records)) = appended_records(&path, offset) else { continue };
            cursors.insert(path, next_offset);

            for record in records {
                if is_user_prompt(&record) {
                    let session_id = record.session_id.expect("validated user prompt session ID");
                    let cwd = record.cwd.expect("validated user prompt cwd");
                    if belongs_to_workspace(&cwd, workspace) {
                        active_sessions.insert(session_id.clone());
                        on_start(session_id, cwd);
                    }
                } else if is_turn_complete(&record) {
                    let session_id = record.session_id.expect("validated completion session ID");
                    if active_sessions.remove(&session_id) {
                        on_stop(session_id);
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
    fn identifies_prompt_and_completion_without_reading_content() {
        let prompt: TranscriptRecord = serde_json::from_str(
            r#"{"type":"user","sessionId":"session","cwd":"C:\\work","message":{"role":"user","content":"ignored"}}"#,
        ).unwrap();
        let completion: TranscriptRecord = serde_json::from_str(
            r#"{"type":"assistant","sessionId":"session","message":{"role":"assistant","stop_reason":"end_turn","content":"ignored"}}"#,
        ).unwrap();
        assert!(is_user_prompt(&prompt));
        assert!(is_turn_complete(&completion));
    }

    #[test]
    fn ignores_tool_steps_and_sidechain_records() {
        let tool_step: TranscriptRecord = serde_json::from_str(
            r#"{"type":"assistant","sessionId":"session","message":{"role":"assistant","stop_reason":"tool_use"}}"#,
        ).unwrap();
        let sidechain: TranscriptRecord = serde_json::from_str(
            r#"{"type":"user","sessionId":"session","cwd":"C:\\work","isSidechain":true,"message":{"role":"user"}}"#,
        ).unwrap();
        assert!(!is_turn_complete(&tool_step));
        assert!(!is_user_prompt(&sidechain));
    }

    #[test]
    fn detects_all_turn_completion_reasons() {
        // end_turn - normal completion
        let end_turn: TranscriptRecord = serde_json::from_str(
            r#"{"type":"assistant","sessionId":"session","message":{"role":"assistant","stop_reason":"end_turn"}}"#,
        ).unwrap();
        assert!(is_turn_complete(&end_turn));

        // max_tokens - reached token limit
        let max_tokens: TranscriptRecord = serde_json::from_str(
            r#"{"type":"assistant","sessionId":"session","message":{"role":"assistant","stop_reason":"max_tokens"}}"#,
        ).unwrap();
        assert!(is_turn_complete(&max_tokens));

        // stop_sequence - user-defined stop sequence
        let stop_sequence: TranscriptRecord = serde_json::from_str(
            r#"{"type":"assistant","sessionId":"session","message":{"role":"assistant","stop_reason":"stop_sequence"}}"#,
        ).unwrap();
        assert!(is_turn_complete(&stop_sequence));

        // tool_use should NOT be considered turn completion
        let tool_use: TranscriptRecord = serde_json::from_str(
            r#"{"type":"assistant","sessionId":"session","message":{"role":"assistant","stop_reason":"tool_use"}}"#,
        ).unwrap();
        assert!(!is_turn_complete(&tool_use));
    }
}
