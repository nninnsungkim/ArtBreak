import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    parseClaudePayload,
    parseCodexPayload,
    getNeutralOutput,
    mapClaudeEvent,
    mapCodexEvent
} from '../../src/hooks/types';

describe('hooks/types', () => {
    describe('mapClaudeEvent', () => {
        it('should map UserPromptSubmit to start', () => {
            assert.equal(mapClaudeEvent('UserPromptSubmit'), 'start');
        });

        it('should map Stop to stop', () => {
            assert.equal(mapClaudeEvent('Stop'), 'stop');
        });

        it('should map StopFailure to failure', () => {
            assert.equal(mapClaudeEvent('StopFailure'), 'failure');
        });

        it('should map SessionEnd to session-end', () => {
            assert.equal(mapClaudeEvent('SessionEnd'), 'session-end');
        });
    });

    describe('mapCodexEvent', () => {
        it('should map UserPromptSubmit to start', () => {
            assert.equal(mapCodexEvent('UserPromptSubmit'), 'start');
        });

        it('should map Stop to stop', () => {
            assert.equal(mapCodexEvent('Stop'), 'stop');
        });

        it('should map SessionEnd to session-end', () => {
            assert.equal(mapCodexEvent('SessionEnd'), 'session-end');
        });
    });

    describe('parseClaudePayload', () => {
        it('should parse valid payload with prompt_id', () => {
            const payload = {
                session_id: 'session-123',
                prompt_id: 'prompt-456',
                cwd: '/test/workspace'
            };

            const event = parseClaudePayload('UserPromptSubmit', payload);

            assert.ok(event !== null);
            assert.equal(event!.provider, 'claude');
            assert.equal(event!.event, 'start');
            assert.equal(event!.sessionId, 'session-123');
            assert.equal(event!.turnId, 'prompt-456');
            assert.equal(event!.cwd, '/test/workspace');
        });

        it('should use null turnId when prompt_id absent', () => {
            const payload = {
                session_id: 'session-123',
                cwd: '/test/workspace'
            };

            const event = parseClaudePayload('UserPromptSubmit', payload);

            assert.ok(event !== null);
            assert.equal(event!.turnId, null);
        });

        it('should return null for missing session_id', () => {
            const payload = {
                cwd: '/test/workspace'
            };

            const event = parseClaudePayload('UserPromptSubmit', payload);

            assert.equal(event, null);
        });

        it('should use process.cwd() when cwd is missing', () => {
            const payload = {
                session_id: 'session-123'
            };

            const event = parseClaudePayload('UserPromptSubmit', payload);

            assert.ok(event !== null);
            assert.ok(event!.cwd.length > 0);
        });
    });

    describe('parseCodexPayload', () => {
        it('should parse valid payload with turn_id', () => {
            const payload = {
                session_id: 'session-123',
                turn_id: 'turn-456',
                cwd: '/test/workspace'
            };

            const event = parseCodexPayload('UserPromptSubmit', payload);

            assert.ok(event !== null);
            assert.equal(event!.provider, 'codex');
            assert.equal(event!.event, 'start');
            assert.equal(event!.sessionId, 'session-123');
            assert.equal(event!.turnId, 'turn-456');
            assert.equal(event!.cwd, '/test/workspace');
        });

        it('should use null turnId when turn_id absent', () => {
            const payload = {
                session_id: 'session-123',
                cwd: '/test/workspace'
            };

            const event = parseCodexPayload('Stop', payload);

            assert.ok(event !== null);
            assert.equal(event!.turnId, null);
        });

        it('should return null for missing session_id', () => {
            const payload = {
                turn_id: 'turn-456'
            };

            const event = parseCodexPayload('UserPromptSubmit', payload);

            assert.equal(event, null);
        });
    });

    describe('getNeutralOutput', () => {
        it('should return empty for Claude events', () => {
            assert.equal(getNeutralOutput('claude', 'start'), '');
            assert.equal(getNeutralOutput('claude', 'stop'), '');
            assert.equal(getNeutralOutput('claude', 'failure'), '');
            assert.equal(getNeutralOutput('claude', 'session-end'), '');
        });

        it('should return {} for Codex start', () => {
            assert.equal(getNeutralOutput('codex', 'start'), '{}\n');
        });

        it('should return {} for Codex stop', () => {
            assert.equal(getNeutralOutput('codex', 'stop'), '{}\n');
        });

        it('should return {} for Codex session-end', () => {
            assert.equal(getNeutralOutput('codex', 'session-end'), '{}\n');
        });
    });
});
