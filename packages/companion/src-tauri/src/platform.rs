/// Platform-specific path resolution for ArtBreak state directories.
///
/// This module mirrors the TypeScript implementation in packages/vscode-extension/src/platform/paths.ts

use std::path::PathBuf;

/// Returns the ArtBreak state root directory based on the current platform.
///
/// - macOS: ~/.artbreak
/// - Windows: %LOCALAPPDATA%\ArtBreak
/// - Tests: uses ARTBREAK_HOME environment variable if set
pub fn get_state_root() -> Result<PathBuf, String> {
    // Test/development override
    if let Ok(artbreak_home) = std::env::var("ARTBREAK_HOME") {
        return Ok(PathBuf::from(artbreak_home));
    }

    if cfg!(target_os = "macos") {
        let home = dirs::home_dir()
            .ok_or_else(|| "Could not determine home directory".to_string())?;
        Ok(home.join(".artbreak"))
    } else if cfg!(target_os = "windows") {
        let local_app_data = dirs::data_local_dir()
            .ok_or_else(|| "Could not determine LOCALAPPDATA directory".to_string())?;
        Ok(local_app_data.join("ArtBreak"))
    } else {
        Err(format!("Unsupported platform: {}", std::env::consts::OS))
    }
}

/// Platform-specific paths within the ArtBreak state root.
pub struct StatePaths {
    pub run: PathBuf,
    pub vscode: PathBuf,
    pub sessions: PathBuf,
    pub state: PathBuf,
}

/// Returns platform-specific paths within the ArtBreak state root.
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
/// On Windows, this unifies `/` and `\` separators (a hook payload's `cwd`
/// is not guaranteed to use the same separator style as a VS Code lease's
/// `fsPath`) and performs case-insensitive normalization.
/// On macOS, preserves case and separators.
pub fn normalize_path_for_comparison(path: &PathBuf) -> String {
    let normalized = path.to_string_lossy().to_string();

    if cfg!(target_os = "windows") {
        normalized.replace('/', "\\").to_lowercase()
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
        assert!(root.to_string_lossy().contains("ArtBreak") || root.to_string_lossy().contains(".artbreak"));
    }

    #[test]
    fn test_normalize_path() {
        let path = PathBuf::from("C:\\Users\\Test\\Project");
        let normalized = normalize_path_for_comparison(&path);

        if cfg!(target_os = "windows") {
            assert_eq!(normalized, normalized.to_lowercase());
        }
    }

    #[test]
    fn workspace_match_survives_forward_slash_cwd() {
        // A hook payload's `cwd` is not guaranteed to use the same separator
        // style as a VS Code lease's fsPath. On Windows a forward-slash cwd
        // (as some agent CLIs report) previously failed to match a
        // backslash-style lease, silently dropping every work-start event.
        if cfg!(target_os = "windows") {
            let target = PathBuf::from("c:/dev/project");
            let workspace = PathBuf::from("c:\\dev\\project");
            assert!(is_path_in_workspace(&target, &workspace));
        }
    }
}
