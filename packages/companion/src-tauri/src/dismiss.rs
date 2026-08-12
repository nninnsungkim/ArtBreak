/// Dismiss-until-idle state shared with the VS Code extension.

use crate::platform::get_state_paths;
use crate::utils::safe_unlink;

fn dismiss_path() -> Result<std::path::PathBuf, String> {
    Ok(get_state_paths()?.state.join("dismiss-until-idle.json"))
}

pub fn remove_dismiss_state() -> Result<(), String> {
    safe_unlink(&dismiss_path()?)
}

pub fn write_dismiss_state(now_ms: i64) -> Result<(), String> {
    let path = dismiss_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dismiss directory: {e}"))?;
    }
    let contents = format!(r#"{{"schemaVersion":1,"dismissedAt":{now_ms}}}"#);
    std::fs::write(path, contents).map_err(|e| format!("Failed to write dismiss state: {e}"))
}

/// The Node hook handler owns the JSON schema. Presence of this sentinel file
/// is sufficient for the native process and avoids a duplicated schema.
pub fn is_dismissed() -> Result<bool, String> {
    Ok(dismiss_path()?.exists())
}
