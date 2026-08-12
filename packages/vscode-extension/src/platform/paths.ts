import * as os from 'os';
import * as path from 'path';

/**
 * Returns the ArtWait state root directory based on the current platform.
 *
 * - macOS: ~/.artwait
 * - Windows: %LOCALAPPDATA%\ArtWait
 * - Tests: uses ARTWAIT_HOME environment variable if set
 */
export function getStateRoot(): string {
    // Test/development override
    if (process.env.ARTWAIT_HOME) {
        return process.env.ARTWAIT_HOME;
    }

    const platform = os.platform();

    if (platform === 'darwin') {
        return path.join(os.homedir(), '.artwait');
    } else if (platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) {
            throw new Error('LOCALAPPDATA environment variable not found');
        }
        return path.join(localAppData, 'ArtWait');
    } else {
        throw new Error(`Unsupported platform: ${platform}`);
    }
}

/**
 * Returns platform-specific paths within the ArtWait state root.
 */
export function getStatePaths() {
    const root = getStateRoot();

    return {
        root,
        app: path.join(root, 'app'),
        run: path.join(root, 'run'),
        vscode: path.join(root, 'run', 'vscode'),
        sessions: path.join(root, 'run', 'sessions'),
        state: path.join(root, 'state'),
        backups: path.join(root, 'backups'),
        logs: path.join(root, 'logs'),
    };
}

/**
 * Returns the path to the installed companion executable.
 */
export function getInstalledExecutablePath(): string {
    const paths = getStatePaths();
    const platform = os.platform();

    if (platform === 'darwin') {
        return path.join(paths.app, 'ArtWait.app', 'Contents', 'MacOS', 'artwait');
    } else if (platform === 'win32') {
        return path.join(paths.app, 'artwait.exe');
    } else {
        throw new Error(`Unsupported platform: ${platform}`);
    }
}

/**
 * Normalizes a path for comparison purposes.
 * On Windows, this performs case-insensitive normalization.
 * On macOS, preserves case but normalizes separators.
 */
export function normalizePathForComparison(p: string): string {
    // Normalize separators and resolve relative segments
    const normalized = path.normalize(p);

    // On Windows, lowercase for case-insensitive comparison
    if (os.platform() === 'win32') {
        return normalized.toLowerCase();
    }

    return normalized;
}

/**
 * Checks if a path is contained within a workspace root.
 * Uses path-boundary-aware matching to avoid false positives like:
 * /project-a matching /project-ab
 */
export function isPathInWorkspace(targetPath: string, workspaceRoot: string): boolean {
    const normalizedTarget = normalizePathForComparison(path.resolve(targetPath));
    const normalizedWorkspace = normalizePathForComparison(path.resolve(workspaceRoot));

    // Check if target starts with workspace
    if (!normalizedTarget.startsWith(normalizedWorkspace)) {
        return false;
    }

    // If they're equal, it's a match
    if (normalizedTarget === normalizedWorkspace) {
        return true;
    }

    // Check that the next character is a path separator
    // to ensure we're matching at a directory boundary
    const remainder = normalizedTarget.substring(normalizedWorkspace.length);
    return remainder.startsWith(path.sep);
}
