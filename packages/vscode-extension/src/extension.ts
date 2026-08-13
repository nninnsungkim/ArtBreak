import * as vscode from 'vscode';
import { startLease, stopLease } from './lifecycle';
import {
    pauseForHours,
    pauseUntilEndOfDay,
    pauseIndefinitely,
    pauseForCurrentLeases,
    removePauseState,
    readPauseState
} from './state/pause';
import { readAllLeases } from './state/lease';
import { countActiveMarkers, cleanupStaleMarkers } from './state/marker';
import { removeDismissState } from './state/dismiss';
import {
    getHookStatus,
    installClaudeHooks,
    installCodexHooks,
    removeClaudeHooks,
    removeCodexHooks
} from './hooks/installer';
import { getCompanionPath, installCompanion, showCompanion } from './platform/companion';

const WELCOME_ARTWORK_SHOWN_KEY = 'artwait.welcomeArtworkShown';
const ACTIVITY_MONITOR_INTERVAL_MS = 350;
const ACTIVITY_SHOW_RETRY_MS = 2_600;

function scheduleWelcomeArtwork(context: vscode.ExtensionContext): vscode.Disposable | undefined {
    if (context.globalState.get<boolean>(WELCOME_ARTWORK_SHOWN_KEY) === true) {
        return undefined;
    }

    const timer = setTimeout(() => {
        try {
            // This first artwork never depends on a Claude or Codex hook.
            // It is still a normal ArtWait window, so it respects pause state
            // and the single-window lock used by agent-triggered artwork.
            showCompanion(context.extensionPath, false, 'welcome');
            void context.globalState.update(WELCOME_ARTWORK_SHOWN_KEY, true)
                .then(undefined, error => console.error('ArtWait could not save welcome state', error));
        } catch (error) {
            console.error('ArtWait could not open its welcome artwork', error);
        }
    }, 600);

    return new vscode.Disposable(() => clearTimeout(timer));
}

/**
 * Codex command hooks deliberately do only the small, synchronous part of a
 * lifecycle transition: writing or removing an activity marker. The extension
 * host is already running in VS Code, so it can safely launch the detached,
 * two-second-gated ArtWait window without putting that startup cost inside the
 * hook's short execution budget.
 */
function monitorActiveArtwork(context: vscode.ExtensionContext): vscode.Disposable {
    let disposed = false;
    let checking = false;
    let nextShowEligibleAt = 0;

    const check = async () => {
        if (disposed || checking) return;
        checking = true;

        try {
            const activeMarkers = await countActiveMarkers();
            if (activeMarkers === 0) {
                // A later agent turn should be able to show immediately.
                nextShowEligibleAt = 0;
                return;
            }

            if (Date.now() < nextShowEligibleAt) return;

            // A show process waits for the normal two-second gate and then
            // acquires the native single-window lock. Throttling here avoids
            // launching several identical gate processes while it is waiting.
            nextShowEligibleAt = Date.now() + ACTIVITY_SHOW_RETRY_MS;
            showCompanion(context.extensionPath);
        } catch (error) {
            console.error('ArtWait could not check active agent work', error);
        } finally {
            checking = false;
        }
    };

    const timer = setInterval(() => void check(), ACTIVITY_MONITOR_INTERVAL_MS);
    void check();
    return new vscode.Disposable(() => {
        disposed = true;
        clearInterval(timer);
    });
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('ArtWait extension is now active');

    // Check if remote
    if (vscode.env.remoteName) {
        vscode.window.showWarningMessage(
            'ArtWait does not support remote workspaces. The extension will not be active.'
        );
        return;
    }

    try {
        await installCompanion(context.extensionPath);
    } catch (error) {
        vscode.window.showErrorMessage(`ArtWait companion could not be prepared: ${error}`);
        return;
    }

    // Start lease
    await startLease();

    const welcomeArtwork = scheduleWelcomeArtwork(context);
    const activeArtworkMonitor = monitorActiveArtwork(context);

    // ArtWait is ready to use immediately after installation. Keep both agent
    // integrations current as part of activation instead of requiring a
    // separate Command Palette action. Each installer is idempotent and only
    // rewrites a configuration file when its ArtWait entries need to change.
    const companionPath = getCompanionPath(context.extensionPath);
    const [claudeHooks, codexHooks] = await Promise.all([
        installClaudeHooks(companionPath),
        installCodexHooks(companionPath)
    ]);
    const hookFailures = [claudeHooks, codexHooks]
        .filter(result => !result.success)
        .map(result => result.message);
    if (hookFailures.length > 0) {
        vscode.window.showWarningMessage(
            `ArtWait could not update some agent hooks: ${hookFailures.join(' ')}`
        );
    } else {
        console.log('ArtWait hooks are installed for Claude Code and Codex');
    }

    // Register pause command
    const pauseCommand = vscode.commands.registerCommand('artwait.pause', async () => {
        const choice = await vscode.window.showQuickPick([
            { label: '30 minutes', value: 0.5 },
            { label: '1 hour', value: 1 },
            { label: '2 hours', value: 2 },
            { label: '3 hours', value: 3 },
            { label: '4 hours', value: 4 },
            { label: '5 hours', value: 5 },
            { label: '6 hours', value: 6 },
            { label: '7 hours', value: 7 },
            { label: '8 hours', value: 8 },
            { label: 'Rest of today', value: -4 },
            { label: 'Custom...', value: -1 },
            { label: 'Until all currently open VS Code windows close', value: -2 },
            { label: 'Indefinitely', value: -3 }
        ], {
            placeHolder: 'Pause ArtWait for...'
        });

        if (!choice) return;

        try {
            if (choice.value === -1) {
                // Custom hours
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter number of hours',
                    validateInput: (value) => {
                        const num = parseFloat(value);
                        if (isNaN(num) || num <= 0) {
                            return 'Please enter a positive number';
                        }
                        return null;
                    }
                });

                if (input) {
                    await pauseForHours(parseFloat(input));
                    vscode.window.showInformationMessage(`ArtWait paused for ${input} hours`);
                }
            } else if (choice.value === -2) {
                // Current leases
                const leases = await readAllLeases();
                const leaseIds = leases
                    .filter(l => l.remoteName === null)
                    .map(l => l.leaseId);

                await pauseForCurrentLeases(leaseIds);
                vscode.window.showInformationMessage(
                    'ArtWait paused until all currently open VS Code windows close'
                );
            } else if (choice.value === -3) {
                // Indefinitely
                await pauseIndefinitely();
                vscode.window.showInformationMessage('ArtWait paused indefinitely');
            } else if (choice.value === -4) {
                // Rest of today
                await pauseUntilEndOfDay();
                vscode.window.showInformationMessage('ArtWait paused for the rest of today');
            } else {
                // Fixed hours
                await pauseForHours(choice.value);
                vscode.window.showInformationMessage(`ArtWait paused for ${choice.label}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to pause ArtWait: ${error}`);
        }
    });

    // Register resume command
    const resumeCommand = vscode.commands.registerCommand('artwait.resume', async () => {
        try {
            await removePauseState();
            vscode.window.showInformationMessage('ArtWait resumed');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to resume ArtWait: ${error}`);
        }
    });

    // Register test window command
    const testWindowCommand = vscode.commands.registerCommand('artwait.testWindow', async () => {
        try {
            showCompanion(context.extensionPath, true);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open ArtWait: ${error}`);
        }
    });

    // Register status command
    const statusCommand = vscode.commands.registerCommand('artwait.status', async () => {
        try {
            const pauseState = await readPauseState();
            const activeMarkers = await countActiveMarkers();
            const leases = await readAllLeases();

            let statusMessage = '**ArtWait Status**\n\n';

            if (pauseState) {
                if (pauseState.mode.type === 'fixed') {
                    statusMessage += `⏸️ **Paused** until ${new Date(pauseState.mode.expiresAt).toLocaleString()}\n`;
                } else if (pauseState.mode.type === 'current-leases') {
                    statusMessage += '⏸️ **Paused** until all currently open VS Code windows close\n';
                } else {
                    statusMessage += '⏸️ **Paused** indefinitely\n';
                }
            } else {
                statusMessage += '▶️ **Active**\n';
            }

            statusMessage += `\n📊 Active markers: ${activeMarkers}\n`;
            statusMessage += `💻 VS Code leases: ${leases.length}\n`;

            await vscode.window.showInformationMessage(statusMessage, { modal: true });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get status: ${error}`);
        }
    });

    // Register reset runtime command
    const resetRuntimeCommand = vscode.commands.registerCommand('artwait.resetRuntime', async () => {
        const choice = await vscode.window.showWarningMessage(
            'This will clean up stale markers and dismiss state. Continue?',
            { modal: true },
            'Yes',
            'No'
        );

        if (choice !== 'Yes') return;

        try {
            const cleaned = await cleanupStaleMarkers();
            await removeDismissState();

            vscode.window.showInformationMessage(
                `Runtime reset complete. Cleaned ${cleaned} stale markers.`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reset runtime: ${error}`);
        }
    });

    // Register hook installer commands
    const installHooksCommand = vscode.commands.registerCommand('artwait.installHooks', async () => {
        const choice = await vscode.window.showQuickPick([
            { label: 'Install hooks for Claude Code', value: 'claude' },
            { label: 'Install hooks for Codex', value: 'codex' }
        ], {
            placeHolder: 'Install ArtWait hooks for...'
        });

        if (!choice) return;

        try {
            if (choice.value === 'claude') {
                const result = await installClaudeHooks(getCompanionPath(context.extensionPath));
                if (result.success) {
                    vscode.window.showInformationMessage(result.message);
                } else {
                    vscode.window.showErrorMessage(result.message);
                }
            } else if (choice.value === 'codex') {
                const result = await installCodexHooks(getCompanionPath(context.extensionPath));
                if (result.success) {
                    vscode.window.showInformationMessage(result.message);
                } else {
                    vscode.window.showErrorMessage(result.message);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to install hooks: ${error}`);
        }
    });

    const removeHooksCommand = vscode.commands.registerCommand('artwait.removeHooks', async () => {
        const choice = await vscode.window.showWarningMessage(
            'Remove ArtWait hooks from agent configuration?',
            { modal: true },
            'Yes',
            'No'
        );

        if (choice !== 'Yes') return;

        try {
            const [claudeResult, codexResult] = await Promise.all([
                removeClaudeHooks(),
                removeCodexHooks()
            ]);
            if (claudeResult.success && codexResult.success) {
                vscode.window.showInformationMessage(`${claudeResult.message}. ${codexResult.message}.`);
            } else {
                const failures = [claudeResult, codexResult]
                    .filter(result => !result.success)
                    .map(result => result.message)
                    .join(' ');
                vscode.window.showErrorMessage(failures);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to remove hooks: ${error}`);
        }
    });

    const hookStatusCommand = vscode.commands.registerCommand('artwait.hookStatus', async () => {
        try {
            const status = await getHookStatus();

            let message = '**ArtWait Hook Status**\n\n';
            message += `Claude Code: ${status.claudeInstalled ? '✓ Installed' : '✗ Not installed'}\n`;
            message += `Codex: ${status.codexInstalled ? '✓ Installed' : '✗ Not installed'}\n`;

            if (status.claudePath) {
                message += `\nClaude config: ${status.claudePath}`;
            }
            if (status.codexPath) {
                message += `\nCodex config: ${status.codexPath}`;
            }

            await vscode.window.showInformationMessage(message, { modal: true });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check hook status: ${error}`);
        }
    });

    context.subscriptions.push(
        pauseCommand,
        resumeCommand,
        testWindowCommand,
        statusCommand,
        resetRuntimeCommand,
        installHooksCommand,
        removeHooksCommand,
        hookStatusCommand
    );

    if (welcomeArtwork) {
        context.subscriptions.push(welcomeArtwork);
    }
    context.subscriptions.push(activeArtworkMonitor);
}

export async function deactivate() {
    console.log('ArtWait extension is deactivating');
    await stopLease();
}
