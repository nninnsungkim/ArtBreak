import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { atomicWriteJSON, readJSON, safeUnlink } from '../utils/atomic-write';
import { getStatePaths } from '../platform/paths';

/**
 * Provider type: Claude Code or Codex.
 */
export type Provider = 'claude' | 'codex';

/**
 * Lifecycle event type.
 */
export type LifecycleEvent = 'start' | 'stop' | 'failure' | 'session-end';

/**
 * Session marker schema.
 */
export interface SessionMarker {
    schemaVersion: 1;
    provider: Provider;
    sessionId: string;
    turnId: string | null;
    cwd: string;
    createdAt: number;
}

/**
 * Marker staleness threshold: 24 hours
 */
export const MARKER_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a deterministic hash key for a marker.
 */
export function createMarkerKey(
    provider: Provider,
    sessionId: string,
    turnId: string | null
): string {
    const input = `${provider}|${sessionId}|${turnId || sessionId}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Creates a session marker file.
 */
export async function createMarker(marker: SessionMarker): Promise<void> {
    const paths = getStatePaths();
    const markerKey = createMarkerKey(marker.provider, marker.sessionId, marker.turnId);
    const markerFilePath = path.join(paths.sessions, `${markerKey}.json`);

    await atomicWriteJSON(markerFilePath, marker);
}

/**
 * Removes a session marker by its key.
 */
export async function removeMarker(
    provider: Provider,
    sessionId: string,
    turnId: string | null
): Promise<void> {
    const paths = getStatePaths();
    const markerKey = createMarkerKey(provider, sessionId, turnId);
    const markerFilePath = path.join(paths.sessions, `${markerKey}.json`);

    await safeUnlink(markerFilePath);
}

/**
 * Removes all markers for a given provider and session.
 */
export async function removeSessionMarkers(
    provider: Provider,
    sessionId: string
): Promise<void> {
    const markers = await readAllMarkers();

    for (const marker of markers) {
        if (marker.provider === provider && marker.sessionId === sessionId) {
            await removeMarker(marker.provider, marker.sessionId, marker.turnId);
        }
    }
}

/**
 * Reads all marker files from the sessions directory.
 */
export async function readAllMarkers(): Promise<SessionMarker[]> {
    const paths = getStatePaths();
    const sessionsDir = paths.sessions;

    try {
        const files = await fs.readdir(sessionsDir);
        const markers: SessionMarker[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }

            const markerFilePath = path.join(sessionsDir, file);
            const marker = await readJSON<SessionMarker>(markerFilePath);

            if (marker && marker.schemaVersion === 1) {
                markers.push(marker);
            }
        }

        return markers;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Counts the number of active (non-stale) markers.
 */
export async function countActiveMarkers(now: number = Date.now()): Promise<number> {
    const markers = await readAllMarkers();
    let count = 0;

    for (const marker of markers) {
        const age = now - marker.createdAt;
        if (age <= MARKER_STALE_THRESHOLD_MS) {
            count++;
        }
    }

    return count;
}

/**
 * Removes stale markers (older than 24 hours).
 */
export async function cleanupStaleMarkers(now: number = Date.now()): Promise<number> {
    const markers = await readAllMarkers();
    let cleaned = 0;

    for (const marker of markers) {
        const age = now - marker.createdAt;
        if (age > MARKER_STALE_THRESHOLD_MS) {
            await removeMarker(marker.provider, marker.sessionId, marker.turnId);
            cleaned++;
        }
    }

    return cleaned;
}
