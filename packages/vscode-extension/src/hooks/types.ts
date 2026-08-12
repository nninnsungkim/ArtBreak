/**
 * Hook event types and parsing for Claude Code and Codex.
 */

import { Provider, LifecycleEvent } from '../state/marker';

/**
 * Normalized hook event after parsing provider-specific payloads.
 */
export interface NormalizedHookEvent {
    provider: Provider;
    event: LifecycleEvent;
    sessionId: string;
    turnId: string | null;
    cwd: string;
    occurredAt: number;
}

/**
 * Claude Code hook event names.
 */
export type ClaudeEventName = 'UserPromptSubmit' | 'Stop' | 'StopFailure' | 'SessionEnd';

/**
 * Codex hook event names.
 */
export type CodexEventName = 'UserPromptSubmit' | 'Stop' | 'SessionEnd';

/**
 * Claude Code hook payload (stdin JSON).
 *
 * We only parse the minimum fields needed for lifecycle tracking.
 * Prompt and response content are deliberately not retained.
 */
export interface ClaudeHookPayload {
    session_id: string;
    prompt_id?: string; // Present in recent Claude Code versions
    cwd?: string;
    // Other fields exist but are intentionally not parsed
}

/**
 * Codex hook payload (stdin JSON).
 */
export interface CodexHookPayload {
    session_id: string;
    turn_id?: string;
    cwd?: string;
    // Other fields exist but are intentionally not parsed
}

/**
 * Maps Claude event names to lifecycle events.
 */
export function mapClaudeEvent(eventName: ClaudeEventName): LifecycleEvent {
    switch (eventName) {
        case 'UserPromptSubmit':
            return 'start';
        case 'Stop':
            return 'stop';
        case 'StopFailure':
            return 'failure';
        case 'SessionEnd':
            return 'session-end';
    }
}

/**
 * Maps Codex event names to lifecycle events.
 */
export function mapCodexEvent(eventName: CodexEventName): LifecycleEvent {
    switch (eventName) {
        case 'UserPromptSubmit':
            return 'start';
        case 'Stop':
            return 'stop';
        case 'SessionEnd':
            return 'session-end';
    }
}

/**
 * Parses a Claude Code hook payload.
 */
export function parseClaudePayload(
    eventName: ClaudeEventName,
    payload: unknown
): NormalizedHookEvent | null {
    try {
        const data = payload as ClaudeHookPayload;

        if (!data.session_id) {
            return null;
        }

        // Prefer prompt_id when present, otherwise use session_id
        const turnId = data.prompt_id || null;

        return {
            provider: 'claude',
            event: mapClaudeEvent(eventName),
            sessionId: data.session_id,
            turnId,
            cwd: data.cwd || process.cwd(),
            occurredAt: Date.now(),
        };
    } catch {
        return null;
    }
}

/**
 * Parses a Codex hook payload.
 */
export function parseCodexPayload(
    eventName: CodexEventName,
    payload: unknown
): NormalizedHookEvent | null {
    try {
        const data = payload as CodexHookPayload;

        if (!data.session_id) {
            return null;
        }

        return {
            provider: 'codex',
            event: mapCodexEvent(eventName),
            sessionId: data.session_id,
            turnId: data.turn_id || null,
            cwd: data.cwd || process.cwd(),
            occurredAt: Date.now(),
        };
    } catch {
        return null;
    }
}

/**
 * Gets provider-appropriate neutral stdout output.
 *
 * - Claude: empty for all events
 * - Codex: empty for UserPromptSubmit and SessionEnd, {} for Stop
 */
export function getNeutralOutput(provider: Provider, event: LifecycleEvent): string {
    if (provider === 'codex' && event === 'stop') {
        return '{}\n';
    }
    return '';
}
