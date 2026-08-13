import * as path from 'path';
import { atomicWriteJSON, readJSON, safeUnlink } from '../utils/atomic-write';
import { getStatePaths } from '../platform/paths';
import { isLeaseFresh, readAllLeases } from './lease';

/**
 * Pause mode types.
 */
export type PauseMode =
    | { type: 'fixed'; durationHours: number; expiresAt: number }
    | { type: 'current-leases'; leaseIds: string[] }
    | { type: 'indefinite' };

/**
 * Pause state schema.
 */
export interface PauseState {
    schemaVersion: 1;
    mode: PauseMode;
    createdAt: number;
}

/**
 * Writes the pause state.
 */
export async function writePauseState(state: PauseState): Promise<void> {
    const paths = getStatePaths();
    const pauseFilePath = path.join(paths.state, 'pause.json');

    await atomicWriteJSON(pauseFilePath, state);
}

/**
 * Reads the pause state.
 * Returns null if no pause is active.
 */
export async function readPauseState(): Promise<PauseState | null> {
    const paths = getStatePaths();
    const pauseFilePath = path.join(paths.state, 'pause.json');

    return await readJSON<PauseState>(pauseFilePath);
}

/**
 * Removes the pause state (resumes normal operation).
 */
export async function removePauseState(): Promise<void> {
    const paths = getStatePaths();
    const pauseFilePath = path.join(paths.state, 'pause.json');

    await safeUnlink(pauseFilePath);
}

/**
 * Checks if pause is currently active.
 */
export async function isPauseActive(now: number = Date.now()): Promise<boolean> {
    const state = await readPauseState();

    if (!state) {
        return false;
    }

    switch (state.mode.type) {
        case 'fixed':
            // Check if the pause has expired
            return now < state.mode.expiresAt;

        case 'current-leases': {
            // The pause ends as soon as each lease that existed when the user
            // paused has either closed or stopped heartbeating.
            const leases = await readAllLeases();
            return state.mode.leaseIds.some(leaseId =>
                leases.some(lease => lease.leaseId === leaseId && isLeaseFresh(lease, now))
            );
        }

        case 'indefinite':
            return true;

        default:
            return false;
    }
}

/**
 * Creates a pause state for a fixed duration.
 */
export async function pauseForHours(hours: number): Promise<void> {
    const now = Date.now();
    const expiresAt = now + hours * 60 * 60 * 1000;

    const state: PauseState = {
        schemaVersion: 1,
        mode: {
            type: 'fixed',
            durationHours: hours,
            expiresAt,
        },
        createdAt: now,
    };

    await writePauseState(state);
}

/**
 * Creates an indefinite pause state.
 */
export async function pauseIndefinitely(): Promise<void> {
    const state: PauseState = {
        schemaVersion: 1,
        mode: { type: 'indefinite' },
        createdAt: Date.now(),
    };

    await writePauseState(state);
}

/**
 * Creates a pause state that expires at local midnight (the start of
 * tomorrow), so "rest of today" behaves the same near midnight as it does at
 * noon instead of always adding a flat 24 hours.
 */
export async function pauseUntilEndOfDay(now: number = Date.now()): Promise<void> {
    const endOfDay = new Date(now);
    endOfDay.setHours(24, 0, 0, 0);
    const expiresAt = endOfDay.getTime();

    const state: PauseState = {
        schemaVersion: 1,
        mode: {
            type: 'fixed',
            durationHours: (expiresAt - now) / (60 * 60 * 1000),
            expiresAt,
        },
        createdAt: now,
    };

    await writePauseState(state);
}

/**
 * Creates a pause state for current VS Code leases.
 */
export async function pauseForCurrentLeases(leaseIds: string[]): Promise<void> {
    const state: PauseState = {
        schemaVersion: 1,
        mode: {
            type: 'current-leases',
            leaseIds,
        },
        createdAt: Date.now(),
    };

    await writePauseState(state);
}
