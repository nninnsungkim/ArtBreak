import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    VscodeLease,
    isLeaseFresh,
    writeLease,
    readAllLeases,
    findMatchingLease,
    LEASE_EXPIRY_THRESHOLD_MS
} from '../../src/state/lease';

describe('state/lease', () => {
    let testDir: string;
    let originalHome: string | undefined;

    beforeEach(async () => {
        // Create temp directory for tests
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artbreak-test-'));
        originalHome = process.env.ARTBREAK_HOME;
        process.env.ARTBREAK_HOME = testDir;
    });

    afterEach(async () => {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true });
        if (originalHome) {
            process.env.ARTBREAK_HOME = originalHome;
        } else {
            delete process.env.ARTBREAK_HOME;
        }
    });

    describe('isLeaseFresh', () => {
        it('should return true for recently updated lease', () => {
            const now = Date.now();
            const lease: VscodeLease = {
                schemaVersion: 1,
                leaseId: 'test-lease',
                vscodePid: 12345,
                extensionHostPid: 12346,
                createdAt: now - 5000,
                updatedAt: now - 1000, // 1 second ago
                workspaceRoots: ['/test'],
                remoteName: null
            };

            assert.ok(isLeaseFresh(lease, now));
        });

        it('should return false for expired lease', () => {
            const now = Date.now();
            const lease: VscodeLease = {
                schemaVersion: 1,
                leaseId: 'test-lease',
                vscodePid: 12345,
                extensionHostPid: 12346,
                createdAt: now - 60000,
                updatedAt: now - (LEASE_EXPIRY_THRESHOLD_MS + 1000), // Expired
                workspaceRoots: ['/test'],
                remoteName: null
            };

            assert.ok(!isLeaseFresh(lease, now));
        });
    });

    describe('writeLease and readAllLeases', () => {
        it('should write and read lease', async () => {
            const lease: VscodeLease = {
                schemaVersion: 1,
                leaseId: 'test-lease-1',
                vscodePid: 12345,
                extensionHostPid: 12346,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                workspaceRoots: ['/test/workspace'],
                remoteName: null
            };

            await writeLease(lease);
            const leases = await readAllLeases();

            assert.equal(leases.length, 1);
            assert.equal(leases[0].leaseId, 'test-lease-1');
            assert.equal(leases[0].vscodePid, 12345);
        });
    });

    describe('findMatchingLease', () => {
        it('should find lease matching workspace path', async () => {
            const now = Date.now();
            const lease: VscodeLease = {
                schemaVersion: 1,
                leaseId: 'test-lease',
                vscodePid: 12345,
                extensionHostPid: 12346,
                createdAt: now,
                updatedAt: now,
                workspaceRoots: [path.normalize('/test/workspace')],
                remoteName: null
            };

            await writeLease(lease);

            const targetPath = path.join(path.normalize('/test/workspace'), 'src', 'file.ts');
            const found = await findMatchingLease(targetPath, now);

            assert.ok(found !== null);
            assert.equal(found!.leaseId, 'test-lease');
        });

        it('should not find expired lease', async () => {
            const now = Date.now();
            const lease: VscodeLease = {
                schemaVersion: 1,
                leaseId: 'test-lease',
                vscodePid: 12345,
                extensionHostPid: 12346,
                createdAt: now - 60000,
                updatedAt: now - (LEASE_EXPIRY_THRESHOLD_MS + 1000),
                workspaceRoots: ['/test/workspace'],
                remoteName: null
            };

            await writeLease(lease);

            const found = await findMatchingLease('/test/workspace/src', now);

            assert.equal(found, null);
        });

        it('should not find remote lease', async () => {
            const now = Date.now();
            const lease: VscodeLease = {
                schemaVersion: 1,
                leaseId: 'test-lease',
                vscodePid: 12345,
                extensionHostPid: 12346,
                createdAt: now,
                updatedAt: now,
                workspaceRoots: ['/test/workspace'],
                remoteName: 'ssh-remote'
            };

            await writeLease(lease);

            const found = await findMatchingLease('/test/workspace/src', now);

            assert.equal(found, null);
        });
    });
});
