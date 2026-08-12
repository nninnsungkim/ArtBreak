#!/usr/bin/env node

import { chmodSync, cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { arch, platform } from 'os';
import { dirname, join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(extensionRoot, '..', '..');
const companionRoot = join(repositoryRoot, 'packages', 'companion', 'src-tauri');
const companionPackageRoot = join(repositoryRoot, 'packages', 'companion');
const companionSyncScript = join(repositoryRoot, 'packages', 'companion', 'scripts', 'sync-catalog.mjs');

function hostTarget() {
    if (platform() === 'win32') return arch() === 'arm64' ? 'win32-arm64' : 'win32-x64';
    if (platform() === 'darwin') return arch() === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    throw new Error(`Unsupported build host: ${platform()}/${arch()}`);
}

const target = process.argv[2] || hostTarget();
if (target !== hostTarget()) {
    throw new Error(`This script builds native binaries only. Build ${target} in its matching CI runner.`);
}

const executable = platform() === 'win32' ? 'artwait.exe' : 'artwait';
const isMacOS = platform() === 'darwin';
const macAppBundle = 'ArtWait.app';
// The Tauri frontend references versioned runtime files. Keep those copies in
// sync before compiling so a VSIX always carries the current UI.
execFileSync('node', [companionSyncScript], { cwd: companionRoot, stdio: 'inherit' });
if (isMacOS) {
    // macOS needs the complete Tauri application bundle so the native window,
    // resources, and code signature survive installation inside the VSIX.
    execFileSync('npx', [
        '--no-install', 'tauri', 'build', '--bundles', 'app',
        '--config', '{"bundle":{"active":true}}'
    ], {
        cwd: companionPackageRoot,
        stdio: 'inherit'
    });
} else {
    execFileSync('cargo', ['build', '--release'], { cwd: companionRoot, stdio: 'inherit' });
}

const source = isMacOS
    ? join(companionRoot, 'target', 'release', 'bundle', 'macos', macAppBundle)
    : join(companionRoot, 'target', 'release', executable);
if (!existsSync(source)) {
    throw new Error(`Expected companion executable at ${source}`);
}

const sourceExecutable = isMacOS
    ? join(source, 'Contents', 'MacOS', executable)
    : source;
if (!existsSync(sourceExecutable)) {
    throw new Error(`Expected companion executable at ${sourceExecutable}`);
}

if (isMacOS) {
    // A release pipeline can provide a Developer ID identity through
    // ARTWAIT_MACOS_SIGNING_IDENTITY. CI without that credential uses an
    // ad-hoc signature so macOS can still verify the bundle's integrity.
    const signingIdentity = process.env.ARTWAIT_MACOS_SIGNING_IDENTITY?.trim() || '-';
    execFileSync('codesign', ['--force', '--deep', '--sign', signingIdentity, source], {
        cwd: companionRoot,
        stdio: 'inherit'
    });
    execFileSync('codesign', ['--verify', '--deep', '--strict', source], {
        cwd: companionRoot,
        stdio: 'inherit'
    });

    const appleId = process.env.ARTWAIT_APPLE_ID?.trim();
    const appSpecificPassword = process.env.ARTWAIT_APPLE_APP_PASSWORD?.trim();
    const appleTeamId = process.env.ARTWAIT_APPLE_TEAM_ID?.trim();
    if (appleId && appSpecificPassword && appleTeamId) {
        const notarizationArchive = join(
            companionRoot,
            'target',
            'release',
            'bundle',
            'macos',
            `${macAppBundle}.zip`
        );
        execFileSync('ditto', ['-c', '-k', '--keepParent', source, notarizationArchive], {
            cwd: companionRoot,
            stdio: 'inherit'
        });
        execFileSync('xcrun', [
            'notarytool', 'submit', notarizationArchive,
            '--apple-id', appleId,
            '--password', appSpecificPassword,
            '--team-id', appleTeamId,
            '--wait'
        ], {
            cwd: companionRoot,
            stdio: 'inherit'
        });
        execFileSync('xcrun', ['stapler', 'staple', source], {
            cwd: companionRoot,
            stdio: 'inherit'
        });
        execFileSync('xcrun', ['stapler', 'validate', source], {
            cwd: companionRoot,
            stdio: 'inherit'
        });
        execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose', source], {
            cwd: companionRoot,
            stdio: 'inherit'
        });
    }
}

const destinationDirectory = join(extensionRoot, 'bin', target);
mkdirSync(destinationDirectory, { recursive: true });
const payload = isMacOS ? macAppBundle : executable;
const destination = join(destinationDirectory, payload);
if (statSync(source).isDirectory()) {
    cpSync(source, destination, { recursive: true, force: true, preserveTimestamps: true });
} else {
    copyFileSync(source, destination);
}
const destinationExecutable = isMacOS
    ? join(destination, 'Contents', 'MacOS', executable)
    : destination;
if (isMacOS) {
    chmodSync(destinationExecutable, 0o755);
}

const extensionPackage = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8'));
const manifest = {
    schemaVersion: 1,
    platform: target,
    version: extensionPackage.version,
    payload,
    executable: isMacOS ? join(macAppBundle, 'Contents', 'MacOS', executable) : executable,
    sha256: createHash('sha256').update(readFileSync(destinationExecutable)).digest('hex')
};
writeFileSync(join(destinationDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

execFileSync('npx', [
    '--yes', '@vscode/vsce', 'package',
    '--target', target,
    '--ignore-other-target-folders',
    // This extension has no runtime npm dependencies. In a workspace,
    // dependency discovery can follow sibling packages (including Rust build
    // output) and produce an unusably large VSIX.
    '--no-dependencies'
], {
    cwd: extensionRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
});
