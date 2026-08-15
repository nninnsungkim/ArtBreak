// NOTE: We need console access for hook/control commands, so we attach console conditionally
// instead of using windows_subsystem = "windows"

use clap::{Parser, Subcommand};
use chrono::Utc;
use serde::Deserialize;
use std::io::{self, BufRead, Write};
use std::time::Duration;
use std::fs::OpenOptions;
use std::path::PathBuf;
use tauri::Manager;

mod platform;
mod utils;
mod lease;
mod marker;
mod pause;
mod dismiss;
mod codex_vscode;
mod claude;

#[derive(Parser)]
#[command(name = "artbreak")]
#[command(about = "ArtBreak - Display public-domain paintings while AI agents work")]
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
    /// Watch local Codex VS Code lifecycle events for one workspace.
    WatchCodexVscode {
        /// Absolute workspace root owned by this VS Code window.
        #[arg(long)]
        workspace: String,
    },
    /// Watch local Claude Code terminal and VS Code chat lifecycle events.
    WatchClaude {
        /// Absolute workspace root owned by this VS Code window.
        #[arg(long)]
        workspace: String,
    },
}

#[derive(Subcommand)]
enum ControlAction {
    /// Pause ArtBreak
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
    /// Resume ArtBreak
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

#[tauri::command]
fn pause_for_hours(hours: f64, app: tauri::AppHandle) -> Result<(), String> {
    // The front-end intentionally exposes a short, fixed list rather than a
    // free-form duration. Validate again here because IPC input is untrusted.
    if ![0.5, 1.0, 2.0, 3.0, 4.0, 24.0].contains(&hours) {
        return Err("Unsupported pause duration".to_string());
    }

    let now_ms = Utc::now().timestamp_millis();
    pause::write_pause_state(&pause::PauseState::fixed(hours, now_ms))
        .map_err(|error| format!("Failed to save pause state: {error}"))?;
    app.exit(0);
    Ok(())
}

/// Diagnostic logging for the work-start pipeline, written to
/// `<state root>/hook-debug.log`. Every `handle_show` bail-out already had a
/// `println!`, but the show process is always spawned with stdout nulled, so
/// none of it was ever visible; this writes to a plain file instead so a
/// real failure can be inspected after the fact rather than guessed at. Kept
/// permanently (not just for one investigation) since hook-firing issues are
/// otherwise silent and this is the only way to see what actually happened.
fn log_hook_debug(message: &str) {
    let Ok(paths) = platform::get_state_paths() else { return };
    let Some(root) = paths.state.parent() else { return };
    let log_path = root.join("hook-debug.log");
    let timestamp = Utc::now().to_rfc3339();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(file, "[{timestamp}] {message}");
    }
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
        Some(Commands::WatchCodexVscode { workspace }) => {
            codex_vscode::watch(&workspace, |session_id, cwd| {
                handle_start_event("codex-vscode", &session_id, None, Some(&cwd), Utc::now().timestamp_millis());
            }, |session_id| {
                handle_stop_event("codex-vscode", &session_id, None, Utc::now().timestamp_millis());
            });
        }
        Some(Commands::WatchClaude { workspace }) => {
            claude::watch(&workspace, |session_id, cwd| {
                handle_start_event("claude", &session_id, None, Some(&cwd), Utc::now().timestamp_millis());
            }, |session_id| {
                handle_stop_event("claude", &session_id, None, Utc::now().timestamp_millis());
            });
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
    log_hook_debug(&format!("handle_hook called: provider={provider} event={event} cwd={:?}", std::env::current_dir()));

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
        log_hook_debug(&format!("stdin read FAILED: {e}"));
        eprintln!("Failed to read stdin: {}", e);
        print_neutral_output(provider, event);
        return;
    }
    log_hook_debug(&format!("stdin raw ({} bytes): {}", buffer.len(), buffer.trim()));

    // Parse JSON payload
    let payload: HookPayload = match serde_json::from_str(&buffer) {
        Ok(p) => p,
        Err(e) => {
            log_hook_debug(&format!("JSON parse FAILED: {e}"));
            eprintln!("Failed to parse JSON: {}", e);
            print_neutral_output(provider, event);
            return;
        }
    };

    // Normalize turn_id (use prompt_id for Claude if turn_id not present)
    let turn_id = payload.turn_id.or(payload.prompt_id);
    log_hook_debug(&format!(
        "parsed payload: session_id={} turn_id={:?} cwd={:?}",
        payload.session_id, turn_id, payload.cwd
    ));

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
    let all_leases = lease::read_all_leases();
    log_hook_debug(&format!(
        "handle_start_event: workspace_path={workspace_path:?} known_leases={:?}",
        all_leases.as_ref().map(|leases| leases.iter()
            .map(|l| format!("{}(roots={:?},remote={:?},fresh={})", l.lease_id, l.workspace_roots, l.remote_name, lease::is_lease_fresh(l, now_ms)))
            .collect::<Vec<_>>())
    ));
    match lease::find_matching_lease(workspace_path, now_ms) {
        Ok(Some(lease)) => {
            log_hook_debug(&format!("lease matched: {}", lease.lease_id));
            lease
        }
        Ok(None) => {
            // No matching lease, don't create marker
            log_hook_debug("NO matching lease -- bailing out, no marker created");
            return;
        }
        Err(e) => {
            log_hook_debug(&format!("lease lookup ERROR: {e} -- bailing out"));
            return;
        }
    };

    // 4. If paused → return neutral (no marker creation)
    if let Ok(true) = pause::is_paused(now_ms) {
        log_hook_debug("paused -- bailing out, no marker created");
        return;
    }

    // 5. Create marker
    // Claude's terminal hooks and its VS Code chat transcript identify the
    // same conversation differently. Keep one marker per Claude session so
    // the two harmlessly converge instead of producing parallel UI work.
    let marker_turn_id = if provider == "claude" { None } else { turn_id };
    if let Err(e) = marker::create_marker(provider, session_id, marker_turn_id, workspace_path, now_ms) {
        log_hook_debug(&format!("marker creation FAILED: {e}"));
        eprintln!("Failed to create marker: {}", e);
        return;
    }
    log_hook_debug(&format!(
        "marker created: key={}",
        marker::create_marker_key(provider, session_id, marker_turn_id)
    ));

    // 6. If dismissed → return neutral (no UI spawn)
    if let Ok(true) = dismiss::is_dismissed() {
        log_hook_debug("dismissed -- marker created but not spawning UI");
        return;
    }

    // 7. The activated VS Code extension is the only UI launcher. Terminal
    // hooks and both IDE transcript watchers only write markers, so one AI
    // turn cannot race multiple detached processes into separate windows.
}

fn handle_stop_event(provider: &str, session_id: &str, turn_id: Option<&str>, now_ms: i64) {
    // 1. Remove marker
    let marker_turn_id = if provider == "claude" { None } else { turn_id };
    let _ = marker::remove_marker(provider, session_id, marker_turn_id);

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
    log_hook_debug(&format!("handle_show called: test={test} reason={reason:?}"));

    // Check if paused
    if !test {
        if let Ok(true) = pause::is_paused(now.timestamp_millis()) {
            log_hook_debug("handle_show: paused -- not showing");
            println!("ArtBreak is paused");
            return;
        }

        // A closed artwork stays closed until the current agent turn ends.
        // The VS Code activity monitor and any previously spawned show
        // process can both reach this command, so retain this native guard as
        // the final source of truth as well.
        if !welcome && dismiss::is_dismissed().unwrap_or(false) {
            log_hook_debug("handle_show: dismissed -- not showing");
            println!("ArtBreak is dismissed until the agent stops");
            return;
        }

        if !welcome {
            // Check if there are active markers for an agent-triggered window.
            let active_count = match marker::count_active_markers(now.timestamp_millis()) {
                Ok(count) => count,
                Err(_) => 0,
            };
            log_hook_debug(&format!("handle_show: active_count={active_count}"));

            if active_count == 0 {
                log_hook_debug("handle_show: no active markers -- not showing");
                println!("No active markers - not showing UI");
                return;
            }

            let has_fresh_lease = marker::read_all_markers().unwrap_or_default().iter().any(|marker| {
                let age_ms = now.timestamp_millis() - marker.created_at;
                (0..marker::MARKER_STALENESS_MS).contains(&age_ms) &&
                    lease::find_matching_lease(&marker.cwd, now.timestamp_millis()).ok().flatten().is_some()
            });
            if !has_fresh_lease {
                log_hook_debug("handle_show: no matching fresh lease for any active marker -- not showing");
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
            log_hook_debug("handle_show: markers cleared during 2s gate -- not showing");
            println!("Markers cleared during gate - not showing UI");
            return;
        }

        // The user may have closed the window while this process was waiting
        // through the gate. Re-check immediately before taking the UI lock so
        // that a queued show can never reopen a dismissed artwork.
        if dismiss::is_dismissed().unwrap_or(false) {
            log_hook_debug("handle_show: dismissed during 2s gate -- not showing");
            println!("ArtBreak was dismissed during gate");
            return;
        }
    }

    // The single-instance lock applies even in test mode: only the gate and
    // marker/pause checks above it are test-exempt, so a manual Test Window
    // can never coexist with an already-visible agent-triggered (or other
    // test) window.
    let ui_lock = acquire_ui_lock();
    if ui_lock.is_none() {
        log_hook_debug("handle_show: could not acquire ui.lock -- already visible");
        println!("ArtBreak is already visible");
        return;
    }
    log_hook_debug("handle_show: passed all gates, launching Tauri window now");

    println!("Launching UI...");

    // Launch Tauri app
    #[cfg(not(feature = "cli-only"))]
    {
        let ui_lock_for_monitor = ui_lock.clone();
        let ui_lock_for_close = ui_lock.clone();
        tauri::Builder::default()
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                // When a second instance is launched, bring the existing window to front
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                }
            }))
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![pause_for_hours])
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
