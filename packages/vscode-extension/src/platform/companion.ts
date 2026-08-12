import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { atomicWriteJSON, readJSON } from '../utils/atomic-write';
import { getInstalledExecutablePath, getStatePaths } from './paths';

interface CompanionManifest {
    schemaVersion: 1;
    platform: string;
    version: string;
    payload: string;
    executable: string;
    sha256: string;
}

interface CompanionLayout {
    payload: string;
    executable: string;
}

export function platformTargetFor(platform: NodeJS.Platform, architecture: string): string {
    if (platform === 'win32') {
        return architecture === 'arm64' ? 'win32-arm64' : 'win32-x64';
    }
    if (platform === 'darwin') {
        return architecture === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    }
    throw new Error(`ArtWait does not support ${platform}/${architecture}`);
}

export function platformTarget(): string {
    return platformTargetFor(process.platform, process.arch);
}

/**
 * macOS ships a complete Tauri .app bundle, not an extracted executable. The
 * bundle keeps its WebKit resources and code signature intact after VS Code
 * installs the extension. Windows uses the existing single-file executable.
 */
export function companionLayout(platform: NodeJS.Platform = process.platform): CompanionLayout {
    if (platform === 'win32') {
        return { payload: 'artwait.exe', executable: 'artwait.exe' };
    }
    if (platform === 'darwin') {
        return {
            payload: 'ArtWait.app',
            executable: path.join('ArtWait.app', 'Contents', 'MacOS', 'artwait')
        };
    }
    throw new Error(`ArtWait does not support ${platform}`);
}

function executableName(): string {
    return path.basename(companionLayout().executable);
}

function payloadPath(root: string): string {
    return path.join(root, companionLayout().payload);
}

function executablePathForPayload(payload: string): string {
    if (process.platform === 'darwin') {
        return path.join(payload, 'Contents', 'MacOS', executableName());
    }
    return payload;
}

export function getBundledCompanionPath(extensionPath: string): string {
    const packagedPath = executablePathForPayload(
        payloadPath(path.join(extensionPath, 'bin', platformTarget()))
    );
    if (fs.existsSync(packagedPath)) return packagedPath;

    // Development fallback: the native build lives beside this workspace package.
    const developmentPath = path.resolve(
        extensionPath,
        '..',
        'companion',
        'src-tauri',
        'target',
        'debug',
        executableName()
    );
    if (fs.existsSync(developmentPath)) {
        return developmentPath;
    }

    throw new Error('ArtWait companion is missing from this extension package. Reinstall ArtWait.');
}

export function getCompanionPath(_extensionPath: string): string {
    const installedPath = getInstalledExecutablePath();
    if (fs.existsSync(installedPath)) return installedPath;
    throw new Error('ArtWait companion has not been installed yet. Reload VS Code or reinstall ArtWait.');
}

function bundledManifestPath(extensionPath: string): string {
    return path.join(extensionPath, 'bin', platformTarget(), 'manifest.json');
}

function installedManifestPath(): string {
    return path.join(getStatePaths().app, 'manifest.json');
}

function pendingUpdatePath(): string {
    const layout = companionLayout();
    const extension = path.extname(layout.payload);
    const base = extension ? layout.payload.slice(0, -extension.length) : layout.payload;
    return path.join(getStatePaths().app, `${base}.next${extension}`);
}

async function sha256(filePath: string): Promise<string> {
    const buffer = await fsPromises.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function readBundledManifest(extensionPath: string, source: string): Promise<CompanionManifest> {
    const manifest = await readJSON<CompanionManifest>(bundledManifestPath(extensionPath));
    const layout = companionLayout();
    if (!manifest || manifest.schemaVersion !== 1 || manifest.platform !== platformTarget() ||
        manifest.payload !== layout.payload || manifest.executable !== layout.executable ||
        path.basename(source) !== executableName() || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
        throw new Error('The bundled ArtWait companion manifest is invalid. Reinstall ArtWait.');
    }
    if ((await sha256(source)).toLowerCase() !== manifest.sha256.toLowerCase()) {
        throw new Error('The bundled ArtWait companion failed its integrity check. Reinstall ArtWait.');
    }
    return manifest;
}

async function copyPayload(source: string, destination: string): Promise<void> {
    const sourceMetadata = await fsPromises.stat(source);
    if (sourceMetadata.isDirectory()) {
        await fsPromises.rm(destination, { recursive: true, force: true });
        await fsPromises.cp(source, destination, { recursive: true, force: true, preserveTimestamps: true });
        return;
    }
    await fsPromises.copyFile(source, destination);
}

async function removePayload(payload: string): Promise<void> {
    await fsPromises.rm(payload, { recursive: true, force: true });
}

async function ensureExecutableMode(executable: string): Promise<void> {
    if (process.platform === 'darwin') {
        await fsPromises.chmod(executable, 0o755);
    }
}

/**
 * Installs the VSIX-bundled companion at a stable user-local path. Agent hook
 * configuration always targets this path, so Marketplace upgrades never leave
 * hooks pointing at an obsolete extension-version directory.
 */
export async function installCompanion(extensionPath: string): Promise<{
    path: string;
    updated: boolean;
    pending: boolean;
}> {
    const sourceExecutable = getBundledCompanionPath(extensionPath);
    const sourcePayload = payloadPath(path.join(extensionPath, 'bin', platformTarget()));
    const bundledManifest = await readBundledManifest(extensionPath, sourceExecutable);
    const installedPath = getInstalledExecutablePath();
    const appPath = getStatePaths().app;
    const stagedPath = pendingUpdatePath();
    const installedPayload = payloadPath(appPath);
    await fsPromises.mkdir(appPath, { recursive: true });

    const installedManifest = await readJSON<CompanionManifest>(installedManifestPath()).catch(() => null);
    const installedMatches = fs.existsSync(installedPath) &&
        installedManifest?.sha256?.toLowerCase() === bundledManifest.sha256.toLowerCase() &&
        (await sha256(installedPath)).toLowerCase() === bundledManifest.sha256.toLowerCase();
    if (installedMatches) {
        return { path: installedPath, updated: false, pending: false };
    }

    await copyPayload(sourcePayload, stagedPath);
    const stagedExecutable = executablePathForPayload(stagedPath);
    await ensureExecutableMode(stagedExecutable);
    if ((await sha256(stagedExecutable)).toLowerCase() !== bundledManifest.sha256.toLowerCase()) {
        throw new Error('The staged ArtWait companion failed its integrity check.');
    }

    if (!fs.existsSync(installedPayload)) {
        await fsPromises.rename(stagedPath, installedPayload);
        await ensureExecutableMode(installedPath);
        await atomicWriteJSON(installedManifestPath(), bundledManifest);
        return { path: installedPath, updated: true, pending: false };
    }

    const payloadExtension = path.extname(installedPayload);
    const payloadBase = payloadExtension
        ? installedPayload.slice(0, -payloadExtension.length)
        : installedPayload;
    const rollbackPath = `${payloadBase}.rollback.${Date.now()}${payloadExtension}`;
    try {
        // Moving the old payload first preserves it until the new staged copy
        // is ready to take the stable name. Windows refuses this move while a
        // visible companion is running; in that case the pending copy remains
        // for the next activation and existing hooks keep working.
        await fsPromises.rename(installedPayload, rollbackPath);
        await fsPromises.rename(stagedPath, installedPayload);
        await ensureExecutableMode(installedPath);
        await atomicWriteJSON(installedManifestPath(), bundledManifest);
        await removePayload(rollbackPath).catch(() => undefined);
        return { path: installedPath, updated: true, pending: false };
    } catch (error) {
        if (!fs.existsSync(installedPayload) && fs.existsSync(rollbackPath)) {
            await fsPromises.rename(rollbackPath, installedPayload).catch(() => undefined);
        }
        // Keep a verified staged payload for a later activation rather than
        // interrupting a visible artwork window or breaking existing hooks.
        return { path: installedPath, updated: false, pending: true };
    }
}

export function showCompanion(extensionPath: string, test = false, reason?: string): void {
    const args = ['show'];
    if (test) {
        args.push('--test');
    }
    if (reason) {
        args.push('--reason', reason);
    }

    const child = spawn(getCompanionPath(extensionPath), args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    child.unref();
}
