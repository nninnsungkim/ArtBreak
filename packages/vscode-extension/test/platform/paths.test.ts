import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import {
    getStateRoot,
    normalizePathForComparison,
    isPathInWorkspace
} from '../../src/platform/paths';

describe('platform/paths', () => {
    describe('getStateRoot', () => {
        it('should return ARTBREAK_HOME if set', () => {
            const originalHome = process.env.ARTBREAK_HOME;
            process.env.ARTBREAK_HOME = '/tmp/artbreak-test';

            const root = getStateRoot();
            assert.equal(root, '/tmp/artbreak-test');

            // Restore
            if (originalHome) {
                process.env.ARTBREAK_HOME = originalHome;
            } else {
                delete process.env.ARTBREAK_HOME;
            }
        });

        it('should return platform-specific path when ARTBREAK_HOME not set', () => {
            const originalHome = process.env.ARTBREAK_HOME;
            delete process.env.ARTBREAK_HOME;

            const root = getStateRoot();
            const platform = os.platform();

            if (platform === 'darwin') {
                assert.ok(root.endsWith('.artbreak'));
            } else if (platform === 'win32') {
                assert.ok(root.includes('ArtBreak'));
            }

            // Restore
            if (originalHome) {
                process.env.ARTBREAK_HOME = originalHome;
            }
        });
    });

    describe('normalizePathForComparison', () => {
        it('should normalize path separators', () => {
            const normalized = normalizePathForComparison('a/b\\c');
            assert.ok(normalized.includes(path.sep));
        });

        it('should lowercase on Windows', () => {
            if (os.platform() === 'win32') {
                const normalized = normalizePathForComparison('C:\\Users\\Test');
                assert.equal(normalized, normalized.toLowerCase());
            }
        });

        it('should preserve case on macOS', () => {
            if (os.platform() === 'darwin') {
                const input = '/Users/Test';
                const normalized = normalizePathForComparison(input);
                assert.equal(normalized, path.normalize(input));
            }
        });
    });

    describe('isPathInWorkspace', () => {
        it('should match path within workspace', () => {
            const workspace = path.normalize('/project');
            const target = path.join(workspace, 'src', 'file.ts');
            assert.ok(isPathInWorkspace(target, workspace));
        });

        it('should match workspace itself', () => {
            const workspace = path.normalize('/project');
            assert.ok(isPathInWorkspace(workspace, workspace));
        });

        it('should not match sibling with similar name', () => {
            const workspace = path.normalize('/project-a');
            const target = path.normalize('/project-ab');
            assert.ok(!isPathInWorkspace(target, workspace));
        });

        it('should not match parent directory', () => {
            const workspace = path.normalize('/project');
            const target = path.normalize('/');
            assert.ok(!isPathInWorkspace(target, workspace));
        });

        it('should be case-insensitive on Windows', () => {
            if (os.platform() === 'win32') {
                const workspace = 'C:\\Project';
                const target = 'c:\\project\\src\\file.ts';
                assert.ok(isPathInWorkspace(target, workspace));
            }
        });
    });
});
