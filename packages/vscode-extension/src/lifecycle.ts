/**
 * Extension lifecycle management.
 */

import * as vscode from 'vscode';
import { VscodeLease, writeLease, removeLease, LEASE_HEARTBEAT_INTERVAL_MS } from './state/lease';
import * as crypto from 'crypto';

/**
 * Generates a UUID v4.
 */
function uuidv4(): string {
    return crypto.randomUUID();
}

let leaseId: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Gets current VS Code PIDs.
 */
function getPids() {
    return {
        vscodePid: process.pid,
        extensionHostPid: process.ppid || null
    };
}

/**
 * Gets workspace roots.
 */
function getWorkspaceRoots(): string[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return [];
    }

    return folders.map(folder => folder.uri.fsPath);
}

/**
 * Checks if running in remote mode.
 */
function isRemote(): boolean {
    return vscode.env.remoteName !== undefined && vscode.env.remoteName !== null;
}

/**
 * Creates and maintains a VS Code lease.
 */
export async function startLease(): Promise<void> {
    // Don't create lease in remote mode
    if (isRemote()) {
        console.log('ArtBreak: Remote environment detected, not creating lease');
        return;
    }

    leaseId = uuidv4();
    const now = Date.now();

    const pids = getPids();
    const workspaceRoots = getWorkspaceRoots();

    const lease: VscodeLease = {
        schemaVersion: 1,
        leaseId,
        vscodePid: pids.vscodePid,
        extensionHostPid: pids.extensionHostPid,
        createdAt: now,
        updatedAt: now,
        workspaceRoots,
        remoteName: vscode.env.remoteName || null
    };

    await writeLease(lease);

    // Start heartbeat
    heartbeatInterval = setInterval(async () => {
        if (!leaseId) return;

        const updatedLease: VscodeLease = {
            ...lease,
            updatedAt: Date.now(),
            workspaceRoots: getWorkspaceRoots() // Update in case workspace changed
        };

        await writeLease(updatedLease);
    }, LEASE_HEARTBEAT_INTERVAL_MS);

    console.log(`ArtBreak: Lease created (${leaseId})`);
}

/**
 * Stops the lease and heartbeat.
 */
export async function stopLease(): Promise<void> {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    if (leaseId) {
        await removeLease(leaseId);
        console.log(`ArtBreak: Lease removed (${leaseId})`);
        leaseId = null;
    }
}
