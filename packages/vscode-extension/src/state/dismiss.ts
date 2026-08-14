import * as path from 'path';
import { atomicWriteJSON, readJSON, safeUnlink } from '../utils/atomic-write';
import { getStatePaths } from '../platform/paths';

/**
 * Dismiss-until-idle state schema.
 *
 * When present, ArtBreak should not display during the current continuous busy period.
 * This state is removed when the active marker count returns to zero.
 */
export interface DismissState {
    schemaVersion: 1;
    dismissedAt: number;
}

/**
 * Writes the dismiss-until-idle state.
 */
export async function writeDismissState(): Promise<void> {
    const paths = getStatePaths();
    const dismissFilePath = path.join(paths.state, 'dismiss-until-idle.json');

    const state: DismissState = {
        schemaVersion: 1,
        dismissedAt: Date.now(),
    };

    await atomicWriteJSON(dismissFilePath, state);
}

/**
 * Reads the dismiss-until-idle state.
 * Returns null if not dismissed.
 */
export async function readDismissState(): Promise<DismissState | null> {
    const paths = getStatePaths();
    const dismissFilePath = path.join(paths.state, 'dismiss-until-idle.json');

    return await readJSON<DismissState>(dismissFilePath);
}

/**
 * Removes the dismiss-until-idle state.
 */
export async function removeDismissState(): Promise<void> {
    const paths = getStatePaths();
    const dismissFilePath = path.join(paths.state, 'dismiss-until-idle.json');

    await safeUnlink(dismissFilePath);
}

/**
 * Checks if dismiss is currently active.
 */
export async function isDismissActive(): Promise<boolean> {
    const state = await readDismissState();
    return state !== null;
}
