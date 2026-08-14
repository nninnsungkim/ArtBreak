import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    pauseForHours,
    pauseUntilEndOfDay,
    pauseIndefinitely,
    pauseForCurrentLeases,
    isPauseActive,
    readPauseState,
    removePauseState
} from '../../src/state/pause';

describe('state/pause', () => {
    let testDir: string;
    let originalHome: string | undefined;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artbreak-test-'));
        originalHome = process.env.ARTBREAK_HOME;
        process.env.ARTBREAK_HOME = testDir;
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        if (originalHome) {
            process.env.ARTBREAK_HOME = originalHome;
        } else {
            delete process.env.ARTBREAK_HOME;
        }
    });

    describe('pauseForHours', () => {
        it('should create fixed duration pause', async () => {
            await pauseForHours(2);

            const state = await readPauseState();
            assert.ok(state !== null);
            assert.equal(state!.mode.type, 'fixed');

            if (state!.mode.type === 'fixed') {
                assert.equal(state!.mode.durationHours, 2);
            }
        });

        it('should be active before expiry', async () => {
            const now = Date.now();
            await pauseForHours(1);

            // Check 30 minutes later (should still be active)
            const isActive = await isPauseActive(now + 30 * 60 * 1000);
            assert.ok(isActive);
        });

        it('should be inactive after expiry', async () => {
            const now = Date.now();
            await pauseForHours(1);

            // Check 2 hours later (should be expired)
            const isActive = await isPauseActive(now + 2 * 60 * 60 * 1000);
            assert.ok(!isActive);
        });
    });

    describe('pauseUntilEndOfDay', () => {
        it('should expire at local midnight, not a flat 24 hours later', async () => {
            const now = new Date(2026, 0, 15, 22, 0, 0, 0).getTime(); // 10pm
            await pauseUntilEndOfDay(now);

            const state = await readPauseState();
            assert.ok(state !== null);
            assert.equal(state!.mode.type, 'fixed');

            const expectedMidnight = new Date(2026, 0, 16, 0, 0, 0, 0).getTime();
            if (state!.mode.type === 'fixed') {
                assert.equal(state!.mode.expiresAt, expectedMidnight);
            }
        });

        it('should be active before midnight and inactive after', async () => {
            const now = new Date(2026, 0, 15, 22, 0, 0, 0).getTime();
            await pauseUntilEndOfDay(now);

            const beforeMidnight = new Date(2026, 0, 15, 23, 59, 0, 0).getTime();
            const afterMidnight = new Date(2026, 0, 16, 0, 1, 0, 0).getTime();

            assert.ok(await isPauseActive(beforeMidnight));
            assert.ok(!(await isPauseActive(afterMidnight)));
        });
    });

    describe('pauseIndefinitely', () => {
        it('should create indefinite pause', async () => {
            await pauseIndefinitely();

            const state = await readPauseState();
            assert.ok(state !== null);
            assert.equal(state!.mode.type, 'indefinite');
        });

        it('should always be active', async () => {
            await pauseIndefinitely();

            const isActive = await isPauseActive(Date.now() + 999999999);
            assert.ok(isActive);
        });
    });

    describe('pauseForCurrentLeases', () => {
        it('should create current-leases pause', async () => {
            const leaseIds = ['lease-1', 'lease-2'];
            await pauseForCurrentLeases(leaseIds);

            const state = await readPauseState();
            assert.ok(state !== null);
            assert.equal(state!.mode.type, 'current-leases');

            if (state!.mode.type === 'current-leases') {
                assert.deepEqual(state!.mode.leaseIds, leaseIds);
            }
        });
    });

    describe('removePauseState', () => {
        it('should remove pause state', async () => {
            await pauseIndefinitely();

            let state = await readPauseState();
            assert.ok(state !== null);

            await removePauseState();

            state = await readPauseState();
            assert.equal(state, null);

            const isActive = await isPauseActive();
            assert.ok(!isActive);
        });
    });
});
