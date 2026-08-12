/**
 * Hook event processing logic.
 *
 * This implements the start/stop/session-end processing order
 * defined in the implementation plan.
 */

import { NormalizedHookEvent } from './types';
import {
    createMarker,
    removeMarker,
    removeSessionMarkers,
    countActiveMarkers,
    cleanupStaleMarkers,
    SessionMarker
} from '../state/marker';
import { findMatchingLease } from '../state/lease';
import { isPauseActive } from '../state/pause';
import { isDismissActive, removeDismissState } from '../state/dismiss';

/**
 * Processes a start event.
 *
 * Processing order:
 * 1. Clean stale runtime files
 * 2. Count markers before this start
 * 3. If count was zero, remove orphaned dismiss state
 * 4. Find matching fresh lease
 * 5. If no lease, return false (neutral)
 * 6. If pause active, return false (neutral, no marker)
 * 7. Create/update marker
 * 8. If dismiss active, return false (neutral, no UI spawn)
 * 9. Return true to indicate UI should spawn
 */
export async function processStartEvent(
    event: NormalizedHookEvent
): Promise<{ shouldSpawnUI: boolean; marker: SessionMarker | null }> {
    // Clean stale markers
    await cleanupStaleMarkers();

    // Count markers before this start
    const preStartCount = await countActiveMarkers();

    // If count was zero, remove orphaned dismiss state
    if (preStartCount === 0) {
        await removeDismissState();
    }

    // Find matching fresh lease
    const lease = await findMatchingLease(event.cwd);
    if (!lease) {
        return { shouldSpawnUI: false, marker: null };
    }

    // Check if pause is active
    const paused = await isPauseActive();
    if (paused) {
        // Don't create marker when paused
        return { shouldSpawnUI: false, marker: null };
    }

    // Create marker
    const marker: SessionMarker = {
        schemaVersion: 1,
        provider: event.provider,
        sessionId: event.sessionId,
        turnId: event.turnId,
        cwd: event.cwd,
        createdAt: event.occurredAt,
    };

    await createMarker(marker);

    // Check if dismiss is active
    const dismissed = await isDismissActive();
    if (dismissed) {
        // Marker created, but don't spawn UI
        return { shouldSpawnUI: false, marker };
    }

    // Spawn UI
    return { shouldSpawnUI: true, marker };
}

/**
 * Processes a stop event.
 *
 * Processing order:
 * 1. Remove exact marker when possible
 * 2. If active count becomes zero, remove dismiss state
 */
export async function processStopEvent(
    event: NormalizedHookEvent
): Promise<void> {
    // Remove exact marker
    await removeMarker(event.provider, event.sessionId, event.turnId);

    // Check if count became zero
    const count = await countActiveMarkers();
    if (count === 0) {
        await removeDismissState();
    }
}

/**
 * Processes a session-end event.
 *
 * Processing order:
 * 1. Remove all markers for provider + sessionId
 * 2. If active count becomes zero, remove dismiss state
 */
export async function processSessionEndEvent(
    event: NormalizedHookEvent
): Promise<void> {
    // Remove all session markers
    await removeSessionMarkers(event.provider, event.sessionId);

    // Check if count became zero
    const count = await countActiveMarkers();
    if (count === 0) {
        await removeDismissState();
    }
}

/**
 * Processes a failure event (treated as stop for lifecycle).
 */
export async function processFailureEvent(
    event: NormalizedHookEvent
): Promise<void> {
    await processStopEvent(event);
}
