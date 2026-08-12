import * as path from 'path';
import * as fs from 'fs/promises';
import { atomicWriteJSON, readJSON, safeUnlink } from '../utils/atomic-write';
import { getStatePaths, isPathInWorkspace } from '../platform/paths';

/**
 * VS Code lease schema (v1).
 */
export interface VscodeLease {
    schemaVersion: 1;
    leaseId: string;
    vscodePid: number;
    extensionHostPid: number | null;
    createdAt: number;
    updatedAt: number;
    workspaceRoots: string[];
    remoteName: string | null;
}

/**
 * Lease heartbeat interval: 10 seconds
 */
export const LEASE_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Lease expiry threshold: 30 seconds
 */
export const LEASE_EXPIRY_THRESHOLD_MS = 30_000;

/**
 * Creates or updates a VS Code lease.
 */
export async function writeLease(lease: VscodeLease): Promise<void> {
    const paths = getStatePaths();
    const leaseFilePath = path.join(paths.vscode, `${lease.leaseId}.json`);

    await atomicWriteJSON(leaseFilePath, lease);
}

/**
 * Removes a VS Code lease.
 */
export async function removeLease(leaseId: string): Promise<void> {
    const paths = getStatePaths();
    const leaseFilePath = path.join(paths.vscode, `${leaseId}.json`);

    await safeUnlink(leaseFilePath);
}

/**
 * Reads all lease files from the vscode directory.
 */
export async function readAllLeases(): Promise<VscodeLease[]> {
    const paths = getStatePaths();
    const leaseDir = paths.vscode;

    try {
        const files = await fs.readdir(leaseDir);
        const leases: VscodeLease[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }

            const leaseFilePath = path.join(leaseDir, file);
            const lease = await readJSON<VscodeLease>(leaseFilePath);

            if (lease && lease.schemaVersion === 1) {
                leases.push(lease);
            }
        }

        return leases;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Checks if a lease is fresh (not expired).
 */
export function isLeaseFresh(lease: VscodeLease, now: number = Date.now()): boolean {
    const age = now - lease.updatedAt;
    return age <= LEASE_EXPIRY_THRESHOLD_MS;
}

/**
 * Finds a fresh lease that matches the given workspace path.
 * Returns the first matching lease, or null if none found.
 */
export async function findMatchingLease(
    workspacePath: string,
    now: number = Date.now()
): Promise<VscodeLease | null> {
    const leases = await readAllLeases();

    for (const lease of leases) {
        // Ignore remote leases
        if (lease.remoteName !== null) {
            continue;
        }

        // Check if lease is fresh
        if (!isLeaseFresh(lease, now)) {
            continue;
        }

        // Check if workspace path matches any of the lease's workspace roots
        for (const root of lease.workspaceRoots) {
            if (isPathInWorkspace(workspacePath, root)) {
                return lease;
            }
        }
    }

    return null;
}
