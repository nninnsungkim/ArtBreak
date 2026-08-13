// NOTE: We need console access for hook/control commands, so we attach console conditionally
// instead of using windows_subsystem = "windows"

use clap::{Parser, Subcommand};
use chrono::Utc;
use serde::Deserialize;
use std::io::{self, BufRead};
use std::process::{Command, Stdio};
use std::time::Duration;
use std::fs::OpenOptions;
use std::path::PathBuf;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod platform;
mod utils;
mod lease;
mod marker;
mod pause;
mod dismiss;

#[derive(Parser)]
#[command(name = "artwait")]
#[command(about = "ArtWait - Display public-domain paintings while AI agents work")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Hook mode - process agent lifecycle events
    Hook {
        /// Provider (claude or codex)
        provider: String,
        /// Event (start, stop, failure, session-end)
        event: String,
    },
    /// Show mode - display artwork window
    Show {
        /// Test mode (no 2-second gate)
        #[arg(long)]
        test: bool,
        /// Reason for showing
        #[arg(long)]
        reason: Option<String>,
    },
    /// Control mode - pause/resume/status
    Control {
        #[command(subcommand)]
        action: ControlAction,
    },
}

#[derive(Subcommand)]
enum ControlAction {
    /// Pause ArtWait
    Pause {
        /// Number of hours
        #[arg(long)]
        hours: Option<f64>,
        /// Pause indefinitely
        #[arg(long)]
        indefinite: bool,
        /// Pause until current leases expire
        #[arg(long)]
        current_leases: bool,
    },
    /// Resume ArtWait
    Resume,
    /// Show status
    Status,
    /// Reset runtime state
    ResetRuntime,
}

#[derive(Debug, Deserialize)]
struct HookPayload {
    session_id: String,
    #[serde(default)]
    turn_id: Option<String>,
    #[serde(default)]
    prompt_id: Option<String>,
    cwd: Option<String>,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Hook { provider, event }) => {
            handle_hook(&provider, &event);
        }
        Some(Commands::Show { test, reason }) => {
            handle_show(test, reason);
        }
        Some(Commands::Control { action }) => {
            handle_control(action);
        }
        None => {
            // No command - default to show mode
            handle_show(false, None);
        }
    }
}

fn handle_hook(provider: &str, event: &str) {
    let now = Utc::now();
    let now_ms = now.timestamp_millis();

    // Codex invokes lifecycle commands without closing, or in some builds
    // without supplying, stdin. A hook must answer before its two-second
    // timeout, so use a stable per-workspace marker instead of waiting for a
    // payload that may never arrive. The working directory distinguishes
    // simultaneous Codex sessions in different VS Code workspaces.
    if provider == "codex" {
        let cwd = std::env::current_dir()
            .ok()
            .and_then(|path| path.to_str().map(str::to_owned));
        let workspace_path = cwd.as_deref().unwrap_or(".");
        const CODEX_SESSION_ID: &str = "codex-workspace";

        match event {
            "start" => handle_start_event(provider, CODEX_SESSION_ID, None, Some(workspace_path), now_ms),
            "stop" => handle_stop_event(provider, CODEX_SESSION_ID, None, now_ms),
            "failure" => handle_failure_event(provider, CODEX_SESSION_ID, None),
            "session-end" => handle_session_end_event(provider, CODEX_SESSION_ID, now_ms),
            _ => {}
        }

        print_neutral_output(provider, event);
        return;
    }

    // Claude delivers one JSON payload on stdin.
    let mut buffer = String::new();
    if let Err(e) = io::stdin().lock().read_line(&mut buffer) {
        eprintln!("Failed to read stdin: {}", e);
        print_neutral_output(provider, event);
        return;
    }

    // Parse JSON payload
    let payload: HookPayload = match serde_json::from_str(&buffer) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to parse JSON: {}", e);
            print_neutral_output(provider, event);
            return;
        }
    };

    // Normalize turn_id (use prompt_id for Claude if turn_id not present)
    let turn_id = payload.turn_id.or(payload.prompt_id);

    match event {
        "start" => handle_start_event(provider, &payload.session_id, turn_id.as_deref(), payload.cwd.as_deref(), now_ms),
        "stop" => handle_stop_event(provider, &payload.session_id, turn_id.as_deref(), now_ms),
        "failure" => handle_failure_event(provider, &payload.session_id, turn_id.as_deref()),
        "session-end" => handle_session_end_event(provider, &payload.session_id, now_ms),
        _ => {}
    }

    print_neutral_output(provider, event);
}

fn handle_start_event(
    provider: &str,
    session_id: &str,
    turn_id: Option<&str>,
    cwd: Option<&str>,
    now_ms: i64,
) {
    // 1. Clean stale markers
    let _ = marker::cleanup_stale_markers(now_ms);

    // 2. Check if idle (no active markers) → remove dismiss state
    if let Ok(0) = marker::count_active_markers(now_ms) {
        let _ = dismiss::remove_dismiss_state();
    }

    // 3. Find matching VS Code lease
    let workspace_path = cwd.unwrap_or(".");
    match lease::find_matching_lease(workspace_path, now_ms) {
        Ok(Some(lease)) => lease,
        Ok(None) => {
            // No matching lease, don't create marker
            return;
        }
        Err(_) => return,
    };

    // 4. If paused → return neutral (no marker creation)
    if let Ok(true) = pause::is_paused(now_ms) {
        return;
    }

    // 5. Create marker
    if let Err(e) = marker::create_marker(provider, session_id, turn_id, workspace_path, now_ms) {
        eprintln!("Failed to create marker: {}", e);
        return;
    }

    // 6. If dismissed → return neutral (no UI spawn)
    if let Ok(true) = dismiss::is_dismissed() {
        return;
    }

    // 7. Claude starts the detached UI itself. Codex hooks must return as
    // quickly as possible: the activated VS Code extension observes this
    // marker and launches the same gated UI on its behalf. This avoids making
    // Codex treat a valid start event as a timed-out command hook on Windows.
    if provider != "codex" {
        spawn_ui_async(false);
    }
}

fn handle_stop_event(provider: &str, session_id: &str, turn_id: Option<&str>, now_ms: i64) {
    // 1. Remove marker
    let _ = marker::remove_marker(provider, session_id, turn_id);

    // 2. If count becomes 0 → remove dismiss state
    if let Ok(0) = marker::count_active_markers(now_ms) {
        let _ = dismiss::remove_dismiss_state();
    }
}

fn handle_failure_event(provider: &str, session_id: &str, turn_id: Option<&str>) {
    // Same as stop - remove marker
    let _ = marker::remove_marker(provider, session_id, turn_id);
}

fn handle_session_end_event(provider: &str, session_id: &str, now_ms: i64) {
    // 1. Remove all session markers
    let _ = marker::remove_all_session_markers(provider, session_id);

    // 2. If count becomes 0 → remove dismiss state
    if let Ok(0) = marker::count_active_markers(now_ms) {
        let _ = dismiss::remove_dismiss_state();
    }
}

fn spawn_ui_async(test_mode: bool) {
    // The executable is bundled inside the VSIX, so reuse this process's
    // location instead of requiring a separate companion installation path.
    let exe_path = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return,
    };

    // A Claude hook owns stdin/stdout/stderr pipes. The visible UI must not
    // inherit those handles: keeping them open makes Claude wait for the UI
    // process instead of receiving the hook's immediate neutral response.
    #[cfg(windows)]
    {
        // The hook process can own a console and pipes that must be released
        // immediately. Launch the UI directly instead of invoking a command
        // shell, and suppress console creation for the show process.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = Command::new(&exe_path);
        cmd.arg("show")
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if test_mode {
            cmd.arg("--test");
        }
        let _ = cmd.spawn();
    }

    #[cfg(not(windows))]
    {
        let mut cmd = Command::new(exe_path);
        cmd.arg("show")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if test_mode {
            cmd.arg("--test");
        }
        let _ = cmd.spawn();
    }
}

fn print_neutral_output(provider: &str, _event: &str) {
    // Current Codex command hooks parse every lifecycle response as JSON. An
    // empty response makes UserPromptSubmit and Stop report as failed, so keep
    // every Codex hook response deliberately neutral but syntactically valid.
    if provider == "codex" {
        println!("{{}}");
    }
    // All other events: empty output
}

fn handle_show(test: bool, reason: Option<String>) {
    let now = Utc::now();
    let welcome = reason.as_deref() == Some("welcome");

    // Check if paused
    if !test {
        if let Ok(true) = pause::is_paused(now.timestamp_millis()) {
            println!("ArtWait is paused");
            return;
        }

        if !welcome {
            // Check if there are active markers for an agent-triggered window.
            let active_count = match marker::count_active_markers(now.timestamp_millis()) {
                Ok(count) => count,
                Err(_) => 0,
            };

            if active_count == 0 {
                println!("No active markers - not showing UI");
                return;
            }

            let has_fresh_lease = marker::read_all_markers().unwrap_or_default().iter().any(|marker| {
                let age_ms = now.timestamp_millis() - marker.created_at;
                (0..marker::MARKER_STALENESS_MS).contains(&age_ms) &&
                    lease::find_matching_lease(&marker.cwd, now.timestamp_millis()).ok().flatten().is_some()
            });
            if !has_fresh_lease {
                println!("No matching fresh VS Code lease - not showing UI");
                return;
            }
        }
    }

    // Agent-triggered artwork waits two seconds. A first-run welcome opens
    // immediately, without pretending that an agent task is active.
    if !test && !welcome {
        std::thread::sleep(Duration::from_secs(2));

        // Re-check markers after gate
        let active_count = match marker::count_active_markers(Utc::now().timestamp_millis()) {
            Ok(count) => count,
            Err(_) => 0,
        };

        if active_count == 0 {
            println!("Markers cleared during gate - not showing UI");
            return;
        }
    }

    // The single-instance lock applies even in test mode: only the gate and
    // marker/pause checks above it are test-exempt, so a manual Test Window
    // can never coexist with an already-visible agent-triggered (or other
    // test) window.
    let ui_lock = acquire_ui_lock();
    if ui_lock.is_none() {
        println!("ArtWait is already visible");
        return;
    }

    println!("Launching UI...");

    // Launch Tauri app
    #[cfg(not(feature = "cli-only"))]
    {
        let ui_lock_for_monitor = ui_lock.clone();
        let ui_lock_for_close = ui_lock.clone();
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .setup(move |app| {
                if !test && !welcome {
                    let app_handle = app.handle().clone();
                    let ui_lock_for_monitor = ui_lock_for_monitor.clone();
                    std::thread::spawn(move || loop {
                        std::thread::sleep(Duration::from_millis(500));
                        let now_ms = Utc::now().timestamp_millis();
                        let active_markers = marker::read_all_markers().unwrap_or_default();
                        let active_markers: Vec<_> = active_markers.into_iter().filter(|marker| {
                            let age_ms = now_ms - marker.created_at;
                            (0..marker::MARKER_STALENESS_MS).contains(&age_ms)
                        }).collect();
                        let idle = active_markers.is_empty();
                        let has_fresh_lease = active_markers.iter().any(|marker| {
                            lease::find_matching_lease(&marker.cwd, now_ms).ok().flatten().is_some()
                        });
                        let paused = pause::is_paused(now_ms).unwrap_or(false);
                        if idle || !has_fresh_lease || paused {
                            // app_handle.exit() terminates the process before
                            // code after run() is guaranteed to execute.
                            // Release the single-instance lock first so the
                            // next active turn can show artwork immediately.
                            if let Some(path) = &ui_lock_for_monitor {
                                let _ = std::fs::remove_file(path);
                            }
                            app_handle.exit(0);
                            break;
                        }
                    });
                }
                Ok(())
            })
            .on_window_event(move |_window, event| {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                    // Release the single-instance lock regardless of test mode:
                    // a Test Window now holds it too, and leaving it held would
                    // block real agent-triggered windows for up to the 60-second
                    // staleness window after every manual test.
                    if let Some(path) = &ui_lock_for_close {
                        let _ = std::fs::remove_file(path);
                    }
                    if !test && marker::count_active_markers(Utc::now().timestamp_millis()).unwrap_or(0) > 0 {
                        let _ = dismiss::write_dismiss_state(Utc::now().timestamp_millis());
                    }
                }
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");

        if let Some(path) = ui_lock {
            let _ = std::fs::remove_file(path);
        }
    }

    #[cfg(feature = "cli-only")]
    {
        println!("UI mode not available in CLI-only build");
    }
}

fn acquire_ui_lock() -> Option<PathBuf> {
    let paths = platform::get_state_paths().ok()?;
    std::fs::create_dir_all(&paths.run).ok()?;
    let lock_path = paths.run.join("ui.lock");

    if lock_path.exists() {
        let stale = lock_path.metadata().ok().and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age > Duration::from_secs(60));
        if stale {
            let _ = std::fs::remove_file(&lock_path);
        }
    }

    OpenOptions::new().write(true).create_new(true).open(&lock_path).ok()?;
    Some(lock_path)
}

fn handle_control(action: ControlAction) {
    let now = Utc::now();

    match action {
        ControlAction::Pause { hours, indefinite, current_leases } => {
            let now_ms = now.timestamp_millis();
            let state = if indefinite {
                pause::PauseState::indefinite(now_ms)
            } else if current_leases {
                let lease_ids = lease::read_all_leases().unwrap_or_default().into_iter()
                    .filter(|lease| lease::is_lease_fresh(lease, now_ms))
                    .map(|lease| lease.lease_id)
                    .collect();
                pause::PauseState::current_leases(lease_ids, now_ms)
            } else if let Some(h) = hours {
                pause::PauseState::fixed(h, now_ms)
            } else {
                eprintln!("Pause requires --hours, --indefinite, or --current-leases");
                return;
            };

            match pause::write_pause_state(&state) {
                Ok(_) => {
                    if indefinite {
                        println!("Paused indefinitely");
                    } else if current_leases {
                        println!("Paused until current leases expire");
                    } else if let Some(h) = hours {
                        println!("Paused for {} hours", h);
                    }
                }
                Err(e) => eprintln!("Failed to write pause state: {}", e),
            }
        }
        ControlAction::Resume => {
            match pause::remove_pause_state() {
                Ok(_) => println!("Resumed"),
                Err(e) => eprintln!("Failed to remove pause state: {}", e),
            }
        }
        ControlAction::Status => {
            // Check pause state
            let paused = pause::is_paused(now.timestamp_millis()).unwrap_or(false);
            let pause_info = if paused {
                match pause::read_pause_state() {
                    Ok(Some(pause::PauseState { mode: pause::PauseMode::Fixed { expires_at, .. }, .. })) => {
                        format!("Paused until {}", expires_at)
                    }
                    Ok(Some(pause::PauseState { mode: pause::PauseMode::CurrentLeases { .. }, .. })) => {
                        "Paused (current leases)".to_string()
                    }
                    Ok(Some(pause::PauseState { mode: pause::PauseMode::Indefinite, .. })) => {
                        "Paused (indefinite)".to_string()
                    }
                    _ => "Paused".to_string(),
                }
            } else {
                "Active".to_string()
            };

            // Check active markers
            let active_markers = marker::count_active_markers(now.timestamp_millis()).unwrap_or(0);

            // Check dismissed
            let dismissed = dismiss::is_dismissed().unwrap_or(false);

            println!("Status: {}", pause_info);
            println!("Active markers: {}", active_markers);
            println!("Dismissed: {}", dismissed);
        }
        ControlAction::ResetRuntime => {
            let removed = marker::cleanup_stale_markers(now.timestamp_millis()).unwrap_or(0);
            let _ = dismiss::remove_dismiss_state();
            println!("Runtime reset - removed {} stale markers", removed);
        }
    }
}
