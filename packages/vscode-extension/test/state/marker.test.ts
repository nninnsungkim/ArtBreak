import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    SessionMarker,
    createMarkerKey,
    createMarker,
    removeMarker,
    readAllMarkers,
    countActiveMarkers,
    cleanupStaleMarkers,
    MARKER_STALE_THRESHOLD_MS
} from '../../src/state/marker';

describe('state/marker', () => {
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

    describe('createMarkerKey', () => {
        it('should create deterministic hash', () => {
            const key1 = createMarkerKey('claude', 'session-1', 'turn-1');
            const key2 = createMarkerKey('claude', 'session-1', 'turn-1');
            assert.equal(key1, key2);
        });

        it('should create different hashes for different inputs', () => {
            const key1 = createMarkerKey('claude', 'session-1', 'turn-1');
            const key2 = createMarkerKey('claude', 'session-1', 'turn-2');
            assert.notEqual(key1, key2);
        });

        it('should handle null turnId', () => {
            const key = createMarkerKey('codex', 'session-1', null);
            assert.ok(typeof key === 'string');
            assert.equal(key.length, 16);
        });
    });

    describe('createMarker and readAllMarkers', () => {
        it('should create and read marker', async () => {
            const marker: SessionMarker = {
                schemaVersion: 1,
                provider: 'claude',
                sessionId: 'session-1',
                turnId: 'turn-1',
                cwd: '/test/workspace',
                createdAt: Date.now()
            };

            await createMarker(marker);
            const markers = await readAllMarkers();

            assert.equal(markers.length, 1);
            assert.equal(markers[0].provider, 'claude');
            assert.equal(markers[0].sessionId, 'session-1');
        });
    });

    describe('removeMarker', () => {
        it('should remove specific marker', async () => {
            const marker: SessionMarker = {
                schemaVersion: 1,
                provider: 'claude',
                sessionId: 'session-1',
                turnId: 'turn-1',
                cwd: '/test/workspace',
                createdAt: Date.now()
            };

            await createMarker(marker);
            await removeMarker('claude', 'session-1', 'turn-1');

            const markers = await readAllMarkers();
            assert.equal(markers.length, 0);
        });
    });

    describe('countActiveMarkers', () => {
        it('should count only non-stale markers', async () => {
            const now = Date.now();

            // Fresh marker
            const marker1: SessionMarker = {
                schemaVersion: 1,
                provider: 'claude',
                sessionId: 'session-1',
                turnId: 'turn-1',
                cwd: '/test',
                createdAt: now
            };

            // Stale marker
            const marker2: SessionMarker = {
                schemaVersion: 1,
                provider: 'codex',
                sessionId: 'session-2',
                turnId: null,
                cwd: '/test',
                createdAt: now - (MARKER_STALE_THRESHOLD_MS + 1000)
            };

            await createMarker(marker1);
            await createMarker(marker2);

            const count = await countActiveMarkers(now);
            assert.equal(count, 1);
        });
    });

    describe('cleanupStaleMarkers', () => {
        it('should remove only stale markers', async () => {
            const now = Date.now();

            // Fresh marker
            const marker1: SessionMarker = {
                schemaVersion: 1,
                provider: 'claude',
                sessionId: 'session-1',
                turnId: 'turn-1',
                cwd: '/test',
                createdAt: now
            };

            // Stale marker
            const marker2: SessionMarker = {
                schemaVersion: 1,
                provider: 'codex',
                sessionId: 'session-2',
                turnId: null,
                cwd: '/test',
                createdAt: now - (MARKER_STALE_THRESHOLD_MS + 1000)
            };

            await createMarker(marker1);
            await createMarker(marker2);

            const cleaned = await cleanupStaleMarkers(now);
            assert.equal(cleaned, 1);

            const remaining = await readAllMarkers();
            assert.equal(remaining.length, 1);
            assert.equal(remaining[0].sessionId, 'session-1');
        });
    });
});
