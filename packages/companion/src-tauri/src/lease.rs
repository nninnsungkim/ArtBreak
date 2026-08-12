/// VS Code workspace lease management.
///
/// This is deliberately the same on-disk contract written by the VS Code
/// extension.  Millisecond timestamps and camelCase fields make the file safe
/// to read from either the Node or Rust process.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::platform::{get_state_paths, is_path_in_workspace};

pub const LEASE_EXPIRY_MS: i64 = 30_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VscodeLease {
    pub schema_version: u8,
    pub lease_id: String,
    pub vscode_pid: u32,
    pub extension_host_pid: Option<u32>,
    pub created_at: i64,
    pub updated_at: i64,
    pub workspace_roots: Vec<String>,
    pub remote_name: Option<String>,
}

pub fn is_lease_fresh(lease: &VscodeLease, now_ms: i64) -> bool {
    let age_ms = now_ms - lease.updated_at;
    (0..=LEASE_EXPIRY_MS).contains(&age_ms)
}

pub fn read_all_leases() -> Result<Vec<VscodeLease>, String> {
    let lease_dir = get_state_paths()?.vscode;
    if !lease_dir.exists() {
        return Ok(vec![]);
    }

    let mut leases = Vec::new();
    for entry in fs::read_dir(lease_dir).map_err(|e| format!("Failed to read leases: {e}"))? {
        let path = entry.map_err(|e| format!("Failed to read lease entry: {e}"))?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Ok(contents) = fs::read_to_string(&path) {
            if let Ok(lease) = serde_json::from_str::<VscodeLease>(&contents) {
                if lease.schema_version == 1 {
                    leases.push(lease);
                }
            }
        }
    }
    Ok(leases)
}

pub fn find_matching_lease(workspace_path: &str, now_ms: i64) -> Result<Option<VscodeLease>, String> {
    let target_path = PathBuf::from(workspace_path);
    for lease in read_all_leases()? {
        if lease.remote_name.is_some() || !is_lease_fresh(&lease, now_ms) {
            continue;
        }
        if lease.workspace_roots.iter().any(|root| {
            is_path_in_workspace(&target_path, &PathBuf::from(root))
        }) {
            return Ok(Some(lease));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freshness_accepts_current_but_not_expired_leases() {
        let now = 1_000_000;
        let lease = VscodeLease {
            schema_version: 1,
            lease_id: "test".into(),
            vscode_pid: 1,
            extension_host_pid: None,
            created_at: now,
            updated_at: now,
            workspace_roots: vec!["C:\\project".into()],
            remote_name: None,
        };
        assert!(is_lease_fresh(&lease, now));
        assert!(!is_lease_fresh(&lease, now + LEASE_EXPIRY_MS + 1));
    }
}
