/// Session-marker access shared with the VS Code hook handler.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;

use crate::platform::get_state_paths;

pub const MARKER_STALENESS_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMarker {
    pub schema_version: u8,
    pub provider: String,
    pub session_id: String,
    pub turn_id: Option<String>,
    pub cwd: String,
    pub created_at: i64,
}

pub fn create_marker_key(provider: &str, session_id: &str, turn_id: Option<&str>) -> String {
    let input = format!("{provider}|{session_id}|{}", turn_id.unwrap_or(session_id));
    let digest = Sha256::digest(input.as_bytes());
    hex::encode(digest)[..16].to_owned()
}

pub fn create_marker(
    provider: &str,
    session_id: &str,
    turn_id: Option<&str>,
    cwd: &str,
    now_ms: i64,
) -> Result<(), String> {
    let paths = get_state_paths()?;
    fs::create_dir_all(&paths.sessions).map_err(|e| format!("Failed to create marker directory: {e}"))?;
    let marker = SessionMarker {
        schema_version: 1,
        provider: provider.to_owned(),
        session_id: session_id.to_owned(),
        turn_id: turn_id.map(str::to_owned),
        cwd: cwd.to_owned(),
        created_at: now_ms,
    };
    let contents = serde_json::to_string_pretty(&marker).map_err(|e| format!("Failed to serialize marker: {e}"))?;
    let key = create_marker_key(provider, session_id, turn_id);
    fs::write(paths.sessions.join(format!("{key}.json")), contents).map_err(|e| format!("Failed to write marker: {e}"))
}

pub fn remove_marker(provider: &str, session_id: &str, turn_id: Option<&str>) -> Result<(), String> {
    let paths = get_state_paths()?;
    let key = create_marker_key(provider, session_id, turn_id);
    let marker_path = paths.sessions.join(format!("{key}.json"));
    match fs::remove_file(marker_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to remove marker: {error}")),
    }
}

pub fn remove_all_session_markers(provider: &str, session_id: &str) -> Result<(), String> {
    for marker in read_all_markers()? {
        if marker.provider == provider && marker.session_id == session_id {
            remove_marker(&marker.provider, &marker.session_id, marker.turn_id.as_deref())?;
        }
    }
    Ok(())
}

pub fn read_all_markers() -> Result<Vec<SessionMarker>, String> {
    let sessions_dir = get_state_paths()?.sessions;
    if !sessions_dir.exists() {
        return Ok(vec![]);
    }

    let mut markers = Vec::new();
    for entry in fs::read_dir(sessions_dir).map_err(|e| format!("Failed to read markers: {e}"))? {
        let path = entry.map_err(|e| format!("Failed to read marker entry: {e}"))?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Ok(contents) = fs::read_to_string(path) {
            if let Ok(marker) = serde_json::from_str::<SessionMarker>(&contents) {
                if marker.schema_version == 1 {
                    markers.push(marker);
                }
            }
        }
    }
    Ok(markers)
}

pub fn count_active_markers(now_ms: i64) -> Result<usize, String> {
    Ok(read_all_markers()?.iter().filter(|marker| {
        let age_ms = now_ms - marker.created_at;
        (0..MARKER_STALENESS_MS).contains(&age_ms)
    }).count())
}

pub fn cleanup_stale_markers(now_ms: i64) -> Result<usize, String> {
    let paths = get_state_paths()?;
    let mut removed = 0;
    for marker in read_all_markers()? {
        if now_ms - marker.created_at >= MARKER_STALENESS_MS {
            let key = create_marker_key(&marker.provider, &marker.session_id, marker.turn_id.as_deref());
            let marker_path = paths.sessions.join(format!("{key}.json"));
            if fs::remove_file(marker_path).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marker_key_matches_extension_contract() {
        assert_eq!(create_marker_key("claude", "session", Some("turn")), create_marker_key("claude", "session", Some("turn")));
        assert_ne!(create_marker_key("claude", "session", Some("turn")), create_marker_key("codex", "session", Some("turn")));
    }
}
