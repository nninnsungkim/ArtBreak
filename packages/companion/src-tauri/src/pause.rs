/// Pause-state access shared with the VS Code extension.

use serde::{Deserialize, Serialize};

use crate::platform::get_state_paths;
use crate::utils::{atomic_write_json, read_json, safe_unlink};
use crate::lease::{is_lease_fresh, read_all_leases};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PauseState {
    pub schema_version: u8,
    pub mode: PauseMode,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PauseMode {
    Fixed { duration_hours: f64, expires_at: i64 },
    CurrentLeases { lease_ids: Vec<String> },
    Indefinite,
}

impl PauseState {
    pub fn fixed(hours: f64, now_ms: i64) -> Self {
        Self {
            schema_version: 1,
            mode: PauseMode::Fixed { duration_hours: hours, expires_at: now_ms + (hours * 3_600_000.0) as i64 },
            created_at: now_ms,
        }
    }

    pub fn indefinite(now_ms: i64) -> Self {
        Self { schema_version: 1, mode: PauseMode::Indefinite, created_at: now_ms }
    }

    pub fn current_leases(lease_ids: Vec<String>, now_ms: i64) -> Self {
        Self { schema_version: 1, mode: PauseMode::CurrentLeases { lease_ids }, created_at: now_ms }
    }

    pub fn is_active(&self, now_ms: i64) -> bool {
        match &self.mode {
            PauseMode::Fixed { expires_at, .. } => now_ms < *expires_at,
            PauseMode::CurrentLeases { .. } | PauseMode::Indefinite => true,
        }
    }
}

pub fn read_pause_state() -> Result<Option<PauseState>, String> {
    let path = get_state_paths()?.state.join("pause.json");
    if !path.exists() {
        return Ok(None);
    }
    match read_json::<PauseState>(&path) {
        Ok(state) if state.schema_version == 1 => Ok(Some(state)),
        Ok(_) | Err(_) => Ok(None),
    }
}

pub fn write_pause_state(state: &PauseState) -> Result<(), String> {
    atomic_write_json(&get_state_paths()?.state.join("pause.json"), state)
}

pub fn remove_pause_state() -> Result<(), String> {
    safe_unlink(&get_state_paths()?.state.join("pause.json"))
}

pub fn is_paused(now_ms: i64) -> Result<bool, String> {
    let Some(state) = read_pause_state()? else {
        return Ok(false);
    };

    match &state.mode {
        PauseMode::CurrentLeases { lease_ids } => {
            let leases = read_all_leases()?;
            Ok(lease_ids.iter().any(|lease_id| {
                leases.iter().any(|lease| lease.lease_id == *lease_id && is_lease_fresh(lease, now_ms))
            }))
        }
        _ => Ok(state.is_active(now_ms)),
    }
}
