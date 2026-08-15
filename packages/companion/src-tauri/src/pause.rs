/// Pause-state access shared with the VS Code extension.

use chrono::{Local, LocalResult, TimeZone};
use serde::{Deserialize, Serialize};

use crate::platform::get_state_paths;
use crate::utils::{atomic_write_json, read_json, safe_unlink};
use crate::lease::{is_lease_fresh, read_all_leases};

/// Local midnight at the start of the day after `now_ms`. Falls back to a
/// flat 24 hours if the local calendar date can't be resolved (a DST
/// transition landing exactly on midnight), rather than failing the pause.
fn end_of_day_ms(now_ms: i64) -> i64 {
    let Some(now_local) = Local.timestamp_millis_opt(now_ms).single() else {
        return now_ms + 24 * 60 * 60 * 1000;
    };
    let Some(next_date) = now_local.date_naive().succ_opt() else {
        return now_ms + 24 * 60 * 60 * 1000;
    };
    let Some(next_midnight) = next_date.and_hms_opt(0, 0, 0) else {
        return now_ms + 24 * 60 * 60 * 1000;
    };
    match Local.from_local_datetime(&next_midnight) {
        LocalResult::Single(dt) => dt.timestamp_millis(),
        LocalResult::Ambiguous(dt, _) => dt.timestamp_millis(),
        LocalResult::None => now_ms + 24 * 60 * 60 * 1000,
    }
}

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
