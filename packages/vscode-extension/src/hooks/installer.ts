/**
 * Hook configuration installer for Claude Code and Codex.
 *
 * This module safely installs, updates, and removes ArtBreak hooks
 * from Claude and Codex configuration files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as fsSync from 'fs';
import { atomicWriteJSON, readJSON } from '../utils/atomic-write';

/**
 * Hook entry structure for Claude Code.
 */
interface ClaudeHookEntry {
    type?: string;
    command: string;
    args?: string[];
    timeout?: number;
}

/**
 * Hook matcher group for Claude Code.
 */
interface ClaudeHookMatcher {
    hooks: ClaudeHookEntry[];
}

/**
 * Claude Code settings structure (partial).
 */
interface ClaudeSettings {
    hooks?: {
        [eventName: string]: ClaudeHookMatcher[];
    };
}

/**
 * Codex command hook entry. Codex executes the command string through the
 * host shell, with commandWindows available for Windows-specific quoting.
 */
interface CodexHookEntry {
    type?: string;
    command?: string;
    commandWindows?: string;
    timeout?: number;
    [key: string]: unknown;
}

interface CodexHookMatcher {
    matcher?: string;
    hooks?: CodexHookEntry[];
    [key: string]: unknown;
}

interface CodexSettings {
    description?: string;
    hooks?: Record<string, CodexHookMatcher[]>;
    [key: string]: unknown;
}

/**
 * Gets the Claude Code settings path.
 */
function getClaudeSettingsPath(): string {
    return path.join(os.homedir(), '.claude', 'settings.json');
}

/**
 * Gets the Codex hooks path.
 */
function getCodexHooksPath(): string {
    const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
    return path.join(codexHome, 'hooks.json');
}

/**
 * Checks if a hook entry is an ArtBreak hook.
 */
function isArtBreakHook(entry: ClaudeHookEntry): boolean {
    const command = [entry.command, ...(entry.args || [])].join(' ');
    // Claude Code's current schema ignores the old `args` field. Earlier
    // ArtBreak installs therefore persisted as a bare `node` command, which
    // makes Claude attempt to parse hook JSON as JavaScript. A bare Node
    // command with our two-second timeout cannot be a functional hook, so it
    // is safe to migrate alongside the known legacy handler form.
    const legacyBrokenArtBreakHook = entry.command === 'node' &&
        entry.timeout === 2 &&
        (!entry.args || entry.args.length === 0);
    return legacyBrokenArtBreakHook ||
        (entry.command === 'node' && (entry.args || []).some(arg => arg.includes('hook-handler'))) ||
        // Match both the current binary name and ArtWait, its pre-rename name,
        // so upgrading from an ArtWait install cleanly replaces the old entry
        // instead of leaving it orphaned alongside the new ArtBreak one.
        (/art(?:break|wait)(?:\.exe)?(?=["'\s]|$)/i.test(command) && /\bhook\s+claude\b/i.test(command));
}

/**
 * Checks whether a Codex command hook belongs to ArtBreak.
 */
function isArtBreakCodexHook(entry: CodexHookEntry): boolean {
    const command = [entry.command, entry.commandWindows]
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
    // See isArtBreakHook: also match the pre-rename ArtWait command form.
    return /art(?:break|wait)(?:\.exe)?(?=["'\s]|$)/i.test(command) && /\bhook\s+codex\b/i.test(command);
}

/**
 * Quotes a single executable path for the command shell. Windows paths cannot
 * contain a double quote, but escaping preserves a useful error-free command
 * when a profile directory contains spaces.
 */
function quoteCommandPath(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Claude Code executes command hooks through the host shell. Quoting a path
 * that has no whitespace is unnecessary and has caused version-specific
 * parsing issues on Windows, so reserve quoting for paths that require it.
 */
function quoteClaudeCommandPath(value: string): string {
    return /\s/.test(value) ? quoteCommandPath(value) : value;
}

/**
 * Creates an ArtBreak hook entry for Claude Code.
 */
function createClaudeHookEntry(
    companionPath: string,
    event: 'start' | 'stop' | 'session-end'
): ClaudeHookEntry {
    return {
        type: 'command',
        command: `${quoteClaudeCommandPath(companionPath)} hook claude ${event}`,
        timeout: 2
    };
}

/**
 * Creates an ArtBreak command hook for Codex.
 */
function createCodexHookEntry(
    companionPath: string,
    event: 'start' | 'stop' | 'session-end'
): CodexHookEntry {
    // Codex's Windows command runner accepts a bare stable path but can treat
    // unnecessary wrapping quotes as part of the executable token. Retain
    // quotes only for the uncommon profile path that actually needs them.
    const command = `${quoteClaudeCommandPath(companionPath)} hook codex ${event}`;
    return {
        type: 'command',
        command,
        commandWindows: command,
        timeout: 2,
    };
}

/**
 * Installs ArtBreak hooks for Claude Code.
 */
export async function installClaudeHooks(companionPath: string, dryRun = false): Promise<{
    success: boolean;
    message: string;
}> {
    try {
        if (!fsSync.existsSync(companionPath)) {
            throw new Error('The packaged ArtBreak companion is missing');
        }
        const settingsPath = getClaudeSettingsPath();

        // Ensure .claude directory exists
        const claudeDir = path.dirname(settingsPath);
        if (!dryRun) {
            await fs.mkdir(claudeDir, { recursive: true });
        }

        // readJSON returns null for a missing file but throws for invalid JSON,
        // which prevents an installer from overwriting a user's malformed file.
        const existing = await readJSON<ClaudeSettings>(settingsPath);
        const settings: ClaudeSettings = existing || {};

        const originalSettings = JSON.stringify(settings);

        if (!settings.hooks) {
            settings.hooks = {};
        }

        // Claude Code 2.1.x validates hook event names strictly. StopFailure
        // was used by an older ArtBreak configuration but is no longer a
        // supported Claude event, so remove only ArtBreak's legacy entries
        // before adding the current event set.
        const legacyEventNames = ['StopFailure'];
        for (const eventName of legacyEventNames) {
            const matchers = settings.hooks[eventName];
            if (!matchers) continue;
            for (const matcher of matchers) {
                matcher.hooks = matcher.hooks.filter(hook => !isArtBreakHook(hook));
            }
            const remaining = matchers.filter(matcher => matcher.hooks.length > 0);
            if (remaining.length === 0) {
                delete settings.hooks[eventName];
            } else {
                settings.hooks[eventName] = remaining;
            }
        }

        // Install hooks for each event supported by current Claude Code.
        const events: Array<{ name: string; arg: 'start' | 'stop' | 'session-end' }> = [
            { name: 'UserPromptSubmit', arg: 'start' },
            { name: 'Stop', arg: 'stop' },
            { name: 'SessionEnd', arg: 'session-end' }
        ];

        for (const event of events) {
            if (!settings.hooks![event.name]) {
                settings.hooks![event.name] = [];
            }

            // Replace prior ArtBreak entries without touching other hook providers.
            for (const matcher of settings.hooks![event.name]) {
                matcher.hooks = matcher.hooks.filter(
                    hook => !isArtBreakHook(hook)
                );
            }

            // Remove empty matchers
            settings.hooks![event.name] = settings.hooks![event.name].filter(
                matcher => matcher.hooks.length > 0
            );

            // Add new ArtBreak hook
            const hookEntry = createClaudeHookEntry(companionPath, event.arg);
            settings.hooks![event.name].push({
                hooks: [hookEntry]
            });
        }

        const changed = JSON.stringify(settings) !== originalSettings;
        if (!dryRun && changed) {
            // Preserve the user's prior configuration only when ArtBreak is
            // actually making a change. Activation runs on every VS Code
            // start, so unconditional backups would quickly become noise.
            if (existing) {
                const backupPath = path.join(
                    claudeDir,
                    `settings.backup.${Date.now()}.json`
                );
                await atomicWriteJSON(backupPath, existing);
            }
            await atomicWriteJSON(settingsPath, settings);
        }

        return {
            success: true,
            message: changed
                ? `Claude Code hooks ${dryRun ? 'would be ' : ''}installed at ${settingsPath}`
                : `Claude Code hooks are already installed at ${settingsPath}`
        };
    } catch (error) {
        return {
            success: false,
            message: `Failed to install Claude hooks: ${error}`
        };
    }
}

/**
 * Removes ArtBreak hooks from Claude Code.
 */
export async function removeClaudeHooks(): Promise<{
    success: boolean;
    message: string;
}> {
    try {
        const settingsPath = getClaudeSettingsPath();

        const settings = await readJSON<ClaudeSettings>(settingsPath);
        if (!settings || !settings.hooks) {
            return {
                success: true,
                message: 'No hooks found in Claude settings'
            };
        }

        // Create backup
        const claudeDir = path.dirname(settingsPath);
        const backupPath = path.join(
            claudeDir,
            `settings.backup.${Date.now()}.json`
        );
        await atomicWriteJSON(backupPath, settings);

        // Remove ArtBreak hooks
        let removed = 0;
        for (const eventName of Object.keys(settings.hooks)) {
            for (const matcher of settings.hooks[eventName]) {
                const beforeCount = matcher.hooks.length;
                matcher.hooks = matcher.hooks.filter(
                    hook => !isArtBreakHook(hook)
                );
                removed += beforeCount - matcher.hooks.length;
            }

            // Remove empty matchers
            settings.hooks[eventName] = settings.hooks[eventName].filter(
                matcher => matcher.hooks.length > 0
            );
        }

        await atomicWriteJSON(settingsPath, settings);

        return {
            success: true,
            message: `Removed ${removed} ArtBreak hook(s) from Claude Code`
        };
    } catch (error) {
        return {
            success: false,
            message: `Failed to remove Claude hooks: ${error}`
        };
    }
}

/**
 * Installs ArtBreak hooks for Codex.
 *
 * Codex merges hook sources, so this edits only ArtBreak command handlers and
 * preserves every other user-configured hook and matcher.
 */
export async function installCodexHooks(companionPath: string, dryRun = false): Promise<{
    success: boolean;
    message: string;
}> {
    try {
        if (!fsSync.existsSync(companionPath)) {
            throw new Error('The packaged ArtBreak companion is missing');
        }
        const hooksPath = getCodexHooksPath();
        const codexDir = path.dirname(hooksPath);
        if (!dryRun) {
            await fs.mkdir(codexDir, { recursive: true });
        }

        // A malformed existing hooks file must be reported, never replaced.
        const existing = await readJSON<CodexSettings>(hooksPath);
        const settings: CodexSettings = existing || {
            description: 'ArtBreak lifecycle hooks.'
        };

        const originalSettings = JSON.stringify(settings);

        if (!settings.hooks) settings.hooks = {};

        const events: Array<{ name: string; arg: 'start' | 'stop' | 'session-end' }> = [
            { name: 'UserPromptSubmit', arg: 'start' },
            { name: 'Stop', arg: 'stop' },
            { name: 'SessionEnd', arg: 'session-end' },
        ];

        for (const event of events) {
            const matchers = settings.hooks[event.name] || [];
            for (const matcher of matchers) {
                matcher.hooks = (matcher.hooks || []).filter(hook => !isArtBreakCodexHook(hook));
            }
            settings.hooks[event.name] = matchers.filter(matcher => (matcher.hooks || []).length > 0);
            settings.hooks[event.name].push({
                hooks: [createCodexHookEntry(companionPath, event.arg)]
            });
        }

        const changed = JSON.stringify(settings) !== originalSettings;
        if (!dryRun && changed) {
            // Automatic installation is intentionally idempotent so normal VS
            // Code activation does not repeatedly rewrite or back up hooks.
            if (existing) {
                const backupPath = path.join(codexDir, `hooks.backup.${Date.now()}.json`);
                await atomicWriteJSON(backupPath, existing);
            }
            await atomicWriteJSON(hooksPath, settings);
        }

        return {
            success: true,
            message: changed
                ? `Codex hooks ${dryRun ? 'would be ' : ''}installed at ${hooksPath}. Review and trust ArtBreak in Codex /hooks before first use.`
                : `Codex hooks are already installed at ${hooksPath}. Review and trust ArtBreak in Codex /hooks before first use.`
        };
    } catch (error) {
        return {
            success: false,
            message: `Failed to install Codex hooks: ${error}`
        };
    }
}

/**
 * Removes only ArtBreak entries from Codex's hooks file.
 */
export async function removeCodexHooks(): Promise<{
    success: boolean;
    message: string;
}> {
    try {
        const hooksPath = getCodexHooksPath();
        const settings = await readJSON<CodexSettings>(hooksPath);
        if (!settings?.hooks) {
            return { success: true, message: 'No hooks found in Codex settings' };
        }

        const codexDir = path.dirname(hooksPath);
        const backupPath = path.join(codexDir, `hooks.backup.${Date.now()}.json`);
        await atomicWriteJSON(backupPath, settings);

        let removed = 0;
        for (const eventName of Object.keys(settings.hooks)) {
            const matchers = settings.hooks[eventName];
            for (const matcher of matchers) {
                const hooks = matcher.hooks || [];
                const filteredHooks = hooks.filter(hook => !isArtBreakCodexHook(hook));
                removed += hooks.length - filteredHooks.length;
                matcher.hooks = filteredHooks;
            }
            settings.hooks[eventName] = matchers.filter(matcher => (matcher.hooks || []).length > 0);
            if (settings.hooks[eventName].length === 0) {
                delete settings.hooks[eventName];
            }
        }

        if (Object.keys(settings.hooks).length === 0) {
            delete settings.hooks;
            if (settings.description === 'ArtBreak lifecycle hooks.') {
                delete settings.description;
            }
        }

        await atomicWriteJSON(hooksPath, settings);
        return { success: true, message: `Removed ${removed} ArtBreak hook(s) from Codex` };
    } catch (error) {
        return {
            success: false,
            message: `Failed to remove Codex hooks: ${error}`
        };
    }
}

/**
 * Gets the status of installed hooks.
 */
export async function getHookStatus(): Promise<{
    claudeInstalled: boolean;
    codexInstalled: boolean;
    claudePath?: string;
    codexPath?: string;
}> {
    let claudeInstalled = false;
    let codexInstalled = false;

    // Check Claude
    try {
        const settings = await readJSON<ClaudeSettings>(getClaudeSettingsPath());
        if (settings?.hooks) {
            for (const matchers of Object.values(settings.hooks)) {
                for (const matcher of matchers) {
                    if (matcher.hooks.some(h => isArtBreakHook(h))) {
                        claudeInstalled = true;
                        break;
                    }
                }
                if (claudeInstalled) break;
            }
        }
    } catch {
        // File doesn't exist or can't be read
    }

    // Check Codex
    try {
        const settings = await readJSON<CodexSettings>(getCodexHooksPath());
        if (settings?.hooks) {
            for (const matchers of Object.values(settings.hooks)) {
                for (const matcher of matchers) {
                    if ((matcher.hooks || []).some(isArtBreakCodexHook)) {
                        codexInstalled = true;
                        break;
                    }
                }
                if (codexInstalled) break;
            }
        }
    } catch {
        // File does not exist or cannot be read
    }

    return {
        claudeInstalled,
        codexInstalled,
        claudePath: claudeInstalled ? getClaudeSettingsPath() : undefined,
        codexPath: codexInstalled ? getCodexHooksPath() : undefined
    };
}
