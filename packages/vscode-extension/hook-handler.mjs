#!/usr/bin/env node

/**
 * Hook handler script for Claude Code/Codex integration.
 */

import { createRequire } from 'module';
import { stdin } from 'process';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { processStartEvent, processStopEvent, processSessionEndEvent } = require('./out/hooks/processor.js');
const { parseClaudePayload, parseCodexPayload, getNeutralOutput } = require('./out/hooks/types.js');
const { spawn } = require('child_process');

const extensionPath = dirname(fileURLToPath(import.meta.url));

function getCompanionPath() {
    const executable = process.platform === 'win32' ? 'artwait.exe' : 'artwait';
    const target = process.platform === 'win32'
        ? (process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64')
        : (process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64');
    const packagedPath = join(extensionPath, 'bin', target, executable);
    if (existsSync(packagedPath)) return packagedPath;

    const developmentPath = resolve(extensionPath, '..', 'companion', 'src-tauri', 'target', 'debug', executable);
    if (existsSync(developmentPath)) return developmentPath;

    throw new Error('ArtWait companion is missing');
}

const [,, provider, event] = process.argv;

if (!provider || !event) {
    console.error('Usage: node hook-handler.mjs <provider> <event>');
    process.exit(1);
}

async function main() {
    try {
        // Read JSON payload from stdin
        const chunks = [];
        for await (const chunk of stdin) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks).toString('utf8');

        // Parse JSON
        let jsonPayload;
        try {
            jsonPayload = JSON.parse(buffer);
        } catch (err) {
            console.log(getNeutralOutput(provider, event));
            return;
        }

        // Map event name to Claude/Codex format
        const eventName = event === 'start' ? 'UserPromptSubmit'
            : event === 'stop' ? 'Stop'
            : event === 'failure' ? 'StopFailure'
            : event === 'session-end' ? 'SessionEnd'
            : event;

        // Parse payload based on provider
        const normalizedEvent = provider === 'claude'
            ? parseClaudePayload(eventName, jsonPayload)
            : parseCodexPayload(eventName, jsonPayload);

        if (!normalizedEvent) {
            console.log(getNeutralOutput(provider, event));
            return;
        }

        // Process event
        let shouldSpawnUI = false;

        if (normalizedEvent.event === 'start') {
            const result = await processStartEvent(normalizedEvent);
            shouldSpawnUI = result.shouldSpawnUI;
        } else if (normalizedEvent.event === 'stop' || normalizedEvent.event === 'failure') {
            await processStopEvent(normalizedEvent);
        } else if (normalizedEvent.event === 'session-end') {
            await processSessionEndEvent(normalizedEvent);
        }

        // Spawn UI if needed (disabled for now due to WebView2 issues)
        if (shouldSpawnUI) {
            try {
                const execPath = getCompanionPath();
                spawn(execPath, ['show'], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();
            } catch (err) {
                // Silently fail if executable not found
            }
        }

        // Output neutral response
        console.log(getNeutralOutput(provider, normalizedEvent.event));

    } catch (error) {
        // Output neutral on error
        console.log(getNeutralOutput(provider, event));
    }
}

main();
