# Feature proposal: public Codex turn lifecycle API for VS Code extensions

## Summary

Expose a small, versioned API from the `openai.chatgpt` VS Code extension so
other installed extensions can observe when a Codex turn starts and completes.
The API lets integrations react to agent activity without reading private
webview state, watching process activity, modifying user configuration, or
requiring a terminal command.

ArtBreak is a concrete consumer: it opens a distraction-free artwork when a
Codex turn begins and closes it when that turn finishes. The API is deliberately
general so that accessibility, time-tracking, focus, and workspace automation
extensions can use it too.

## Problem and reproduction

1. Install `openai.chatgpt` and ArtBreak in VS Code on Windows or macOS.
2. Send a message from the **Codex** chat panel.
3. Codex starts a local `codex app-server` process and receives the response,
   but a separate VS Code extension receives no public notification that the
   turn started or finished.

Codex CLI hooks cannot solve this for the VS Code chat surface: the VS Code
extension owns the app-server stdio connection, and there is no stable,
supported observer connection for another extension. Scraping the Codex
webview, inspecting private workspace storage, or polling processes would be
fragile and unsuitable for Marketplace extensions.

## Proposed public extension API

The Codex extension should export a minimal API after activation. Consumers use
the normal VS Code extension export mechanism:

```ts
const codex = vscode.extensions.getExtension<CodexTurnLifecycleApi>('openai.chatgpt');
const api = await codex?.activate();
const start = api?.onDidStartTurn(event => {
  // A Codex response has begun for this workspace.
});
const complete = api?.onDidCompleteTurn(event => {
  // The response completed, failed, or was interrupted.
});
```

```ts
export interface CodexTurnLifecycleEvent {
  /** Stable only for the lifetime of this local Codex session. */
  readonly threadId: string;
  readonly turnId: string;
  /** Workspace roots used by the turn; never a file list. */
  readonly workspaceRoots: readonly vscode.Uri[];
  readonly status?: 'completed' | 'failed' | 'interrupted';
}

export interface CodexTurnLifecycleApi {
  readonly version: 1;
  readonly onDidStartTurn: vscode.Event<CodexTurnLifecycleEvent>;
  readonly onDidCompleteTurn: vscode.Event<CodexTurnLifecycleEvent>;
}
```

The API should be available in local, remote, and multi-root workspaces when
the Codex extension itself supports that workspace. It should be unavailable
rather than silently emulated on unsupported surfaces.

## Implementation outline

The Codex app-server already models user work as turns and streams lifecycle
notifications to its client:

1. Map app-server `turn/started` to `onDidStartTurn`.
2. Map `turn/completed` to `onDidCompleteTurn`, including its terminal status.
3. Maintain no additional history and do not replay past events to a newly
   activated observer.
4. Dispatch events from the Codex extension host, not the webview, so the
   contract remains independent of UI layout and private webview messaging.
5. Publish the API contract, compatibility policy, and a small sample.

## Privacy and safety requirements

- Do not expose prompt text, agent text, code, tool arguments, command output,
  account identity, model settings, or raw app-server messages.
- Include only opaque turn/thread identifiers, terminal state, and workspace
  roots needed for an integration to match its own workspace.
- Do not invoke external extensions automatically. They subscribe explicitly
  through VS Code's normal extension activation model.
- Do not require users to write a hook, trust an executable, or change Codex
  configuration.

## Acceptance criteria

1. An integration receives exactly one start notification after a user submits
   a Codex prompt and before the first streamed agent output.
2. It receives exactly one terminal notification for completed, failed, and
   interrupted turns.
3. Two VS Code windows do not receive one another's workspace turn events.
4. The API carries no prompt or response content.
5. Integration tests cover normal completion, cancellation, failure,
   multi-root workspaces, and extension activation after a turn has already
   started.

## ArtBreak follow-up

Once this API ships, ArtBreak will remove its Codex CLI-hook installer and
subscribe to the exported lifecycle API. Claude Code support remains hook-based
because it is a separate terminal product. No user-side installation or
configuration should be required for VS Code Codex.
