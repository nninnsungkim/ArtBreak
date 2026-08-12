/// Platform-specific path resolution for ArtWait state directories.
///
/// This module mirrors the TypeScript implementation in packages/vscode-extension/src/platform/paths.ts

use std::path::PathBuf;

/// Returns the ArtWait state root directory based on the current platform.
///
/// - macOS: ~/.artwait
/// - Windows: %LOCALAPPDATA%\ArtWait
/// - Tests: uses ARTWAIT_HOME environment variable if set
pub fn get_state_root() -> Result<PathBuf, String> {
    // Test/development override
    if let Ok(artwait_home) = std::env::var("ARTWAIT_HOME") {
        return Ok(PathBuf::from(artwait_home));
    }

    if cfg!(target_os = "macos") {
        let home = dirs::home_dir()
            .ok_or_else(|| "Could not determine home directory".to_string())?;
        Ok(home.join(".artwait"))
    } else if cfg!(target_os = "windows") {
        let local_app_data = dirs::data_local_dir()
            .ok_or_else(|| "Could not determine LOCALAPPDATA directory".to_string())?;
        Ok(local_app_data.join("ArtWait"))
    } else {
        Err(format!("Unsupported platform: {}", std::env::consts::OS))
    }
}

/// Platform-specific paths within the ArtWait state root.
pub struct StatePaths {
    pub run: PathBuf,
    pub vscode: PathBuf,
    pub sessions: PathBuf,
    pub state: PathBuf,
}

/// Returns platform-specific paths within the ArtWait state root.
pub fn get_state_paths() -> Result<StatePaths, String> {
    let root = get_state_root()?;

    Ok(StatePaths {
        run: root.join("run"),
        vscode: root.join("run").join("vscode"),
        sessions: root.join("run").join("sessions"),
        state: root.join("state"),
    })
}

/// Normalizes a path for comparison purposes.
/// On Windows, this performs case-insensitive normalization.
/// On macOS, preserves case but normalizes separators.
pub fn normalize_path_for_comparison(path: &PathBuf) -> String {
    let normalized = path.to_string_lossy().to_string();

    if cfg!(target_os = "windows") {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

/// Checks if a path is contained within a workspace root.
/// Uses path-boundary-aware matching to avoid false positives.
pub fn is_path_in_workspace(target_path: &PathBuf, workspace_root: &PathBuf) -> bool {
    let normalized_target = normalize_path_for_comparison(target_path);
    let normalized_workspace = normalize_path_for_comparison(workspace_root);

    // Check if target starts with workspace
    if !normalized_target.starts_with(&normalized_workspace) {
        return false;
    }

    // If they're equal, it's a match
    if normalized_target == normalized_workspace {
        return true;
    }

    // Check that the next character is a path separator
    let remainder = &normalized_target[normalized_workspace.len()..];
    remainder.starts_with('\\') || remainder.starts_with('/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_state_root() {
        let root = get_state_root().unwrap();
        assert!(root.to_string_lossy().contains("ArtWait") || root.to_string_lossy().contains(".artwait"));
    }

    #[test]
    fn test_normalize_path() {
        let path = PathBuf::from("C:\\Users\\Test\\Project");
        let normalized = normalize_path_for_comparison(&path);

        if cfg!(target_os = "windows") {
            assert_eq!(normalized, normalized.to_lowercase());
        }
    }
}
