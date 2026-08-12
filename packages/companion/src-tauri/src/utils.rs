/// Atomic JSON file operations.
///
/// This module mirrors the TypeScript implementation in packages/vscode-extension/src/utils/atomic-write.ts

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tempfile::NamedTempFile;
use std::io::Write;

/// Atomically writes JSON to a file using write → temp → rename pattern.
pub fn atomic_write_json<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Write to temp file in the same directory
    let parent_dir = path.parent().unwrap_or_else(|| Path::new("."));
    let mut temp_file = NamedTempFile::new_in(parent_dir)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    temp_file.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to write to temp file: {}", e))?;

    // Persist and rename atomically
    temp_file.persist(path)
        .map_err(|e| format!("Failed to persist temp file: {}", e))?;

    Ok(())
}

/// Safely reads JSON from a file.
pub fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Safely removes a file (non-throwing).
pub fn safe_unlink(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to remove file: {}", e)),
    }
}
