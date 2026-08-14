import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    companionLayout,
    getCompanionPath,
    installCompanion,
    platformTarget,
    platformTargetFor
} from '../../src/platform/companion';
import { getInstalledExecutablePath } from '../../src/platform/paths';

describe('platform/companion', () => {
    it('uses the complete signed Tauri app bundle on macOS', () => {
        assert.deepEqual(companionLayout('darwin'), {
            payload: 'ArtBreak.app',
            executable: path.join('ArtBreak.app', 'Contents', 'MacOS', 'artbreak')
        });
        assert.equal(platformTargetFor('darwin', 'x64'), 'darwin-x64');
        assert.equal(platformTargetFor('darwin', 'arm64'), 'darwin-arm64');
        assert.equal(platformTargetFor('win32', 'x64'), 'win32-x64');
    });

    it('installs the verified bundled executable at a stable hook path', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'artbreak-companion-'));
        const extensionPath = path.join(root, 'extension');
        const originalHome = process.env.ARTBREAK_HOME;
        process.env.ARTBREAK_HOME = path.join(root, 'state');

        try {
            // Use the real layout (a flat file on Windows, a nested
            // .app/Contents/MacOS bundle on macOS) instead of hand-rolling a
            // platform check here, so this fixture can't silently drift from
            // companionLayout() and pass on one platform while being wrong
            // on the other.
            const layout = companionLayout();
            const payload = Buffer.from('test companion payload');
            const bundledDirectory = path.join(extensionPath, 'bin', platformTarget());
            const executablePath = path.join(bundledDirectory, layout.executable);
            await mkdir(path.dirname(executablePath), { recursive: true });
            await writeFile(executablePath, payload);
            await writeFile(path.join(bundledDirectory, 'manifest.json'), JSON.stringify({
                schemaVersion: 1,
                platform: platformTarget(),
                version: '0.1.0-test',
                payload: layout.payload,
                executable: layout.executable,
                sha256: createHash('sha256').update(payload).digest('hex')
            }));

            const first = await installCompanion(extensionPath);
            assert.equal(first.path, getInstalledExecutablePath());
            assert.equal(first.updated, true);
            assert.equal(first.pending, false);
            assert.equal(getCompanionPath(extensionPath), first.path);

            const second = await installCompanion(extensionPath);
            assert.equal(second.updated, false);
            assert.equal(second.pending, false);
        } finally {
            if (originalHome) {
                process.env.ARTBREAK_HOME = originalHome;
            } else {
                delete process.env.ARTBREAK_HOME;
            }
            await rm(root, { recursive: true, force: true });
        }
    });
});
