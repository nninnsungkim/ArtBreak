  ---
title: ArtBreak - Complete Implementation Plan
status: implementation-ready
language: English
last_verified: 2026-08-07
primary_platforms:
  - macOS Apple Silicon (darwin-arm64)
  - Windows 10/11 x64 (win32-x64)
primary_agents:
  - Claude Code
  - Codex
primary_art_source: The Metropolitan Museum of Art Open Access
architecture_rule: one VS Code extension + one Tauri executable per platform + one build-time catalog script
windows_runtime: system Microsoft Edge WebView2 Evergreen Runtime
---

# ArtBreak - Complete Implementation Plan

## 0. Purpose of This Document

This document is the implementation specification for **ArtBreak**, a minimal VS Code companion that displays one public-domain painting in a separate desktop window while Claude Code or Codex is working.

It is intentionally written for an AI coding agent and a senior engineer. It defines:

- the exact product behavior;
- the smallest acceptable architecture;
- cross-process state and lifecycle rules;
- macOS and Windows platform parity, packaging, process, path, and update rules;
- Claude Code and Codex hook integration;
- the two-second display delay;
- randomized painting navigation using mouse and keyboard;
- Escape, native window-close, temporary pause, and resume behavior;
- The Met public-domain catalog pipeline;
- repository-first reuse rules;
- an incremental, loop-based implementation process;
- tests and exit criteria for every implementation loop;
- explicit non-goals and prohibited complexity.

This document is authoritative unless the repository already contains a tested implementation that satisfies the same behavior more simply. In that case, preserve and extend the existing implementation rather than replacing it.

---

# 1. Executive Summary

## 1.1 One-sentence product definition

**ArtBreak is a free, open-source VS Code companion that opens a minimal black desktop window with one public-domain painting from The Met when Claude Code or Codex remains busy for at least two seconds, then exits automatically when all tracked work is finished.**

## 1.2 Core user flow

1. The user submits a prompt to Claude Code or Codex from a local VS Code desktop workflow.
2. The agent start hook records an active turn.
3. ArtBreak launches hidden and waits **2,000 milliseconds**.
4. If the agent is still active after the delay, a separate desktop window becomes visible.
5. The window displays exactly one painting.
6. The bottom row contains:
   - a left arrow;
   - centered artwork information;
   - a right arrow.
7. Mouse clicks and keyboard arrow keys navigate a randomized, no-repeat painting sequence.
8. The last active agent turn ends.
9. The ArtBreak window and process exit automatically.

## 1.3 Manual user controls

The user must also be able to:

- press `Escape` to dismiss the current display;
- use the native window close button to perform the same dismissal;
- pause ArtBreak for a selected number of hours;
- pause until the currently open local VS Code windows close;
- pause indefinitely;
- resume ArtBreak manually;
- test the window without running an agent;
- diagnose and reset stale runtime state;
- install, repair, or remove hooks without damaging unrelated hook configuration.

## 1.4 Architecture in one line

```text
Agent hook -> filesystem marker -> one Tauri desktop window
```

There is no local server, WebSocket server, IPC daemon, database, VS Code Webview, or runtime collection search.

---

# 2. AI Implementation Contract

An AI implementing this plan MUST follow these rules.

## 2.1 Repository-first rule

Before creating or replacing code:

1. Inspect the repository structure.
2. Read all root and package-level manifests.
3. Identify the existing package manager, workspace system, build scripts, test runners, lint rules, formatting rules, CI workflows, release workflows, and architectural conventions.
4. Search for existing code that already handles:
   - VS Code extension activation;
   - Tauri application startup;
   - command-line argument parsing;
   - filesystem state;
   - atomic writes;
   - hook configuration merging;
   - process spawning;
   - random selection or shuffling;
   - image loading;
   - logging;
   - test fixtures;
   - packaging or notarization.
5. Run the existing baseline build and tests before changing behavior.
6. Reuse working code and existing dependencies when they fit this specification.

Do not create a second abstraction when a tested one already exists.

## 2.2 Minimal-diff rule

Each implementation loop must make the smallest coherent change that can be tested independently.

Do not perform a big-bang rewrite.

Do not reorganize unrelated files while implementing a feature.

Do not rename stable public interfaces without a demonstrated need.

## 2.3 Dependency rule

Before adding any dependency, document:

- the problem it solves;
- why the standard library, platform API, or an existing repository dependency is insufficient;
- the smallest viable alternative;
- its effect on binary size, startup time, security, and packaging.

Prefer:

1. existing repository dependencies;
2. Rust or Node standard-library capabilities;
3. official Tauri and VS Code APIs;
4. one small focused dependency;
5. custom infrastructure only as a last resort.

## 2.4 Test-before-progression rule

Every loop follows:

```text
Inspect -> Reuse -> Specify -> Test -> Implement -> Test -> Simplify -> Verify -> Record
```

Do not proceed to the next loop while relevant tests, type checks, linting, or builds are failing.

Never claim a test passed without running it.

## 2.5 Simplification review rule

At the end of every loop, explicitly inspect the diff for:

- duplicated logic;
- unnecessary classes;
- generic frameworks built for only one use case;
- extra state stores;
- unused dependencies;
- premature configuration;
- dead spike code;
- UI elements outside the approved product scope.

Refactor toward fewer modules and fewer concepts while preserving test coverage.

## 2.6 Progress reporting rule

After each loop, record:

```text
Loop:
Goal:
Existing code reused:
Files changed:
Tests added or changed:
Commands run:
Results:
Simplifications made:
Known limitations:
Next loop:
```

Maintain this in `IMPLEMENTATION_STATUS.md` or the repository's existing engineering log if one already exists.

---

# 3. Scope

## 3.1 First supported release

The first production release supports two native desktop targets from one codebase:

- VS Code Desktop;
- local workspaces;
- macOS Apple Silicon (`darwin-arm64`);
- Windows 10 or Windows 11 x64 (`win32-x64`);
- Claude Code;
- Codex;
- Tauri 2;
- Vanilla TypeScript, HTML, and CSS for the Tauri frontend;
- Rust for lifecycle, filesystem state, and process control;
- The Met public-domain paintings;
- one independent desktop window;
- an embedded, build-time-generated artwork catalog;
- online image loading from the approved The Met image host;
- a separate platform-specific VSIX for `darwin-arm64` and `win32-x64`.

Windows uses the system Microsoft Edge WebView2 Evergreen Runtime. The first release does not bundle a fixed WebView2 runtime and does not add a separate Windows installer.

The user-visible product behavior must be the same on both supported targets. Platform-specific code is allowed only at the operating-system boundary described later in this document.

## 3.2 Explicitly unsupported in the first release

- VS Code for the Web;
- Remote SSH;
- WSL-hosted agent processes;
- Dev Containers;
- GitHub Codespaces;
- remote agent processes running on another machine;
- Linux packaging;
- Intel macOS packaging;
- Windows ARM64 packaging;
- 32-bit Windows;
- Windows 7, Windows 8, and Windows 8.1;
- a VS Code Webview;
- a VS Code sidebar or activity view;
- a system tray application;
- a background daemon that survives independently of VS Code and active agent work;
- multiple artwork windows;
- full-screen mode;
- image zoom and pan;
- favorites;
- artwork search;
- accounts;
- cloud sync;
- analytics or telemetry;
- runtime LLM-generated commentary;
- runtime The Met search;
- runtime catalog mutation;
- a custom settings page;
- a custom title bar;
- a custom image disk cache;
- image downloads;
- artwork editing;
- React, Redux, or another frontend framework;
- MSI, NSIS, or Microsoft Store distribution for the first release.

## 3.3 Later platform expansion

After the dual-platform first release is stable, add targets in this order unless evidence suggests otherwise:

1. Windows ARM64 (`win32-arm64`);
2. macOS Intel (`darwin-x64`);
3. Linux x64;
4. Linux ARM64 or other variants as demanded.

Each target must receive its own tested companion binary and platform-specific VSIX. Do not combine all native binaries into one oversized VSIX unless current Marketplace constraints make that demonstrably simpler.

## 3.4 Platform parity rule

A supported platform is not complete merely because it compiles.

For both `darwin-arm64` and `win32-x64`, all of the following must work:

- hook-mode stdin and stdout;
- the exact two-second display gate;
- hidden startup with no terminal or console flash;
- one-window single-instance behavior;
- mouse and keyboard navigation;
- Escape and native-close dismissal;
- fixed, custom, current-lease, and indefinite pause modes;
- automatic exit after the final active turn;
- companion install, update, rollback, repair, and removal;
- Claude and Codex hook configuration;
- clean-machine installation from the matching VSIX.

Do not call Windows support complete while relying on untested macOS assumptions, and do not fork product behavior by platform.

# 4. Product Behavior Specification

## 4.1 Automatic display

ArtBreak MUST open only when all of these conditions are true:

- a supported agent emits a tracked start event;
- a fresh local VS Code lease matches the hook working directory;
- ArtBreak is not paused;
- the current busy period has not been manually dismissed;
- at least one active marker remains after the two-second delay;
- the companion is running on a supported local desktop environment.

## 4.2 Two-second threshold

The display threshold is exactly:

```text
2,000 milliseconds
```

The application process may start earlier, but the window MUST remain hidden until the threshold has elapsed.

If all active work ends before the threshold, the process MUST exit without ever showing the window.

## 4.3 One painting only

At all times, the visible artwork area MUST contain exactly one displayed painting.

Preloading an image off-DOM or in memory is allowed. Displaying multiple paintings, thumbnails, strips, carousels, or grids is not allowed.

## 4.4 Randomized navigation

A new window session creates a randomized deck of eligible paintings.

- The first painting is selected from the randomized deck.
- The right arrow advances through the randomized deck.
- The left arrow returns through already viewed history.
- If the user moved backward, the right arrow first moves forward through existing history.
- Once the user reaches the end of history, the next right-arrow action consumes the next random painting from the deck.
- No painting repeats until the full deck has been consumed.
- When the deck is exhausted, reshuffle it.
- The first item in a new deck must not equal the most recently displayed painting when the catalog contains more than one painting.

Mouse and keyboard behavior must be equivalent.

## 4.5 Automatic exit

The companion MUST exit when:

- the active marker count reaches zero;
- the matching VS Code lease expires;
- the user presses `Escape`;
- the user closes the native window;
- a pause command becomes active;
- the catalog cannot be loaded and no recoverable fallback exists;
- a controlled reset command requests shutdown.

## 4.6 Manual dismissal semantics

`Escape` and the native close button mean:

> Dismiss ArtBreak for the current continuous busy period, but do not pause future work.

On manual dismissal:

1. Write a `dismiss-until-idle` state file.
2. Exit the companion.
3. Continue tracking markers for the current busy period.
4. Do not reopen while any marker from the continuous busy period remains.
5. Remove the dismiss state automatically when the marker count returns to zero.
6. Allow the next future transition from idle to busy to open ArtBreak normally.

This prevents immediate respawn after a manual close while preserving normal behavior for the next agent task.

## 4.7 Pause semantics

The user can pause ArtBreak through the VS Code Command Palette.

Required choices:

- 1 hour;
- 2 hours;
- 4 hours;
- 8 hours;
- 24 hours;
- custom number of hours;
- until all currently open local VS Code windows have closed;
- indefinitely.

Required commands:

```text
ArtBreak: Pause...
ArtBreak: Resume
```

A pause suppresses new display activations. Work that begins while paused is not retroactively displayed when the pause expires.

If ArtBreak is already visible when a pause is activated, the window must close promptly.

## 4.8 Resume semantics

`ArtBreak: Resume` removes the active pause state.

If tracked markers from work that started before the pause still exist, the extension may invoke the companion again. The normal two-second visibility gate still applies unless the invocation is explicitly a test invocation.

## 4.9 Test mode

`ArtBreak: Test Window` launches:

```text
artbreak show --test
```

Test mode:

- does not require an agent marker;
- ignores dismiss-until-idle state;
- may ignore pause state after an explicit confirmation or by documented design;
- displays immediately or after a short test-only delay, but must not alter the production two-second constant;
- remains open until the user closes it;
- uses the same artwork navigator and UI as production.

---

# 5. Architecture

## 5.1 Required architecture

```text
+-----------------------------------------+
| VS Code Extension                       |
|                                         |
| - installs/updates companion            |
| - installs/repairs/removes hooks        |
| - maintains local VS Code leases        |
| - exposes pause/resume/test/diagnostics  |
+----------------------+------------------+
                       |
                       | writes state / invokes stable binary
                       v
+-----------------------------------------+
| One ArtBreak Tauri Executable             |
|                                         |
| artbreak hook ...   -> CLI hook mode      |
| artbreak show ...   -> desktop UI mode    |
| artbreak control ...-> pause/reset/status |
+----------------------+------------------+
                       |
                       | filesystem only
                       v
+-----------------------------------------+
| <ARTBREAK_HOME>/ runtime and state files   |
|                                         |
| - VS Code leases                         |
| - active turn markers                    |
| - pause state                            |
| - dismiss-until-idle state               |
| - backups and bounded logs               |
+----------------------+------------------+
                       |
                       | UI mode only
                       v
+-----------------------------------------+
| Embedded paintings.json                  |
| + images.metmuseum.org                   |
+-----------------------------------------+

Build time only:
The Met Open Access CSV + Object API -> sync script -> paintings.json
```

## 5.2 Exactly three implementation units

The system must remain limited to:

1. one VS Code extension;
2. one Tauri executable with hook, show, and control modes;
3. one build-time The Met catalog synchronization script.

Do not add a separate hook bridge service, local API server, shared protocol service, database process, or persistent daemon.

## 5.3 Why filesystem state is the cross-process protocol

Filesystem markers are used because they are:

- inspectable;
- easy to test;
- resilient across short-lived hook processes;
- independent of open ports;
- independent of runtime service discovery;
- sufficient for a tiny active-session set;
- compatible with a single-instance UI process;
- simple to clean after failures.

The filesystem is the only cross-process state mechanism.

---

## 5.4 Cross-platform boundary

Keep one architecture and one behavior model. Do not create separate macOS and Windows applications.

Platform-specific code is restricted to these operations:

- resolving the ArtBreak state root;
- resolving the bundled and installed executable paths;
- selecting the correct extension resource;
- launching the UI without a terminal or console flash;
- normalizing paths for workspace matching;
- applying platform-appropriate file permissions and replacement behavior;
- handling executable locking during updates;
- reporting platform prerequisites such as WebView2.

Prefer a small `platform.ts` and `platform.rs`, or equivalent existing modules. Use compile-time `cfg` branches and focused functions. Do not introduce a generic platform framework, dependency-injection container, or trait hierarchy unless existing repository code already requires it.

The cross-process protocol remains files plus CLI arguments on both operating systems.

---

# 6. Component Responsibilities

## 6.1 VS Code extension responsibilities

The extension owns only:

- supported-platform detection;
- selection of the matching `darwin-arm64` or `win32-x64` companion resource;
- companion installation and version replacement;
- stable executable-path discovery;
- lease heartbeat files;
- hook configuration installation, repair, and removal;
- pause and resume commands;
- test-window command;
- diagnostics and runtime reset commands;
- unsupported-environment detection;
- Windows WebView2 failure guidance when a companion launch cannot initialize;
- user-facing setup and Codex trust instructions.

The extension does not:

- render artwork;
- fetch The Met collection at runtime;
- manage random artwork history;
- run a server;
- hold active-agent state in memory as the source of truth;
- invoke `cmd.exe`, PowerShell, or a Unix shell merely to launch the companion.

## 6.2 Tauri executable responsibilities

The same source builds one native executable per supported platform. Each executable supports three modes.

### Hook mode

```text
artbreak hook <provider> <event>
```

Responsibilities:

- read one JSON payload from stdin;
- parse only fields required for lifecycle tracking;
- discard prompt and response content;
- validate lease, pause, and dismiss state;
- atomically create or remove markers;
- launch UI mode as a hidden, independent process when required;
- emit provider-appropriate neutral output;
- exit quickly without initializing Tauri UI.

### Show mode

```text
artbreak show [--test] [--reason <start|resume|test>]
```

Responsibilities:

- enforce single instance;
- start hidden in production mode;
- apply the two-second display gate;
- load the embedded catalog;
- display one painting;
- manage random deck and history;
- monitor marker, pause, dismiss, and lease state;
- close and exit at the correct time.

### Control mode

```text
artbreak control pause --hours <number>
artbreak control pause --indefinite
artbreak control pause --current-leases
artbreak control resume
artbreak control status
artbreak control reset-runtime
```

Responsibilities:

- write or remove small state files;
- return machine-readable status to the extension;
- never require a long-running service.

## 6.3 Catalog script responsibilities

The build-time script owns:

- source download;
- public-domain and painting filters;
- Object API verification;
- normalization;
- deterministic selection;
- schema validation;
- provenance and audit output;
- generation of the embedded runtime catalog.

It is not included in the user runtime path.

## 6.4 Platform boundary responsibilities

The smallest possible platform layer owns:

```text
stateRoot()
installedExecutablePath()
bundledResourcePath()
normalizePathForComparison()
spawnHiddenIndependentUi()
replaceInstalledCompanion()
```

The names are illustrative. Reuse existing repository functions when available.

Rules:

- keep business logic out of platform branches;
- return `PathBuf` or native path objects, not manually concatenated strings;
- keep platform branching at the edges;
- provide contract tests that assert the extension and Rust companion resolve the same state and executable locations;
- do not duplicate marker, pause, lease, navigation, or UI logic by platform.

---

# 7. Repository Reconnaissance and Existing-Code Reuse

This phase happens before implementation, even when the repository appears empty.

## 7.1 Required reconnaissance checklist

- [ ] List repository directories and workspace packages.
- [ ] Read root `package.json`, lockfiles, workspace declarations, `Cargo.toml`, Tauri configuration, extension manifest, and CI files.
- [ ] Identify the package manager already in use.
- [ ] Identify TypeScript compiler and bundler conventions.
- [ ] Identify Rust toolchain and formatting/lint settings.
- [ ] Identify current test runners.
- [ ] Run the existing baseline tests, lint, type checks, and builds.
- [ ] Search for existing VS Code commands and activation code.
- [ ] Search for existing Tauri setup and single-instance behavior.
- [ ] Search for file-state, lock, atomic-write, cleanup, and logging utilities.
- [ ] Search for hook installers or config-merging utilities.
- [ ] Search for artwork models, random selection, image preload, and navigation logic.
- [ ] Search for current packaging, signing, notarization, and VSIX workflows.
- [ ] Record what can be reused before proposing new modules.

## 7.2 Reuse decision rubric

Reuse existing code when it:

- is covered by tests or can be characterized with tests;
- already solves the same responsibility;
- can be adapted without making its API more generic than necessary;
- follows repository conventions;
- is smaller than replacing it.

Replace or remove existing code only when it:

- is demonstrably incorrect for the required lifecycle;
- creates a prohibited architecture such as a server or daemon;
- duplicates another stable module;
- cannot be safely extended;
- is dead or unreachable after a tested migration.

## 7.3 Characterization tests before refactoring

When existing behavior is unclear:

1. add characterization tests around current behavior;
2. confirm the tests pass before modification;
3. change the smallest unit;
4. update tests only when the specification intentionally changes;
5. remove obsolete code after the replacement path is green.

## 7.4 Empty-repository fallback

If the repository is truly empty:

- use the simplest workspace tooling that supports the extension and companion;
- prefer the existing organization standard if known;
- otherwise use npm workspaces for TypeScript packages and Cargo for Rust;
- avoid a monorepo framework unless already present;
- keep root scripts as thin wrappers around package-local scripts.

---

# 8. Local Filesystem Layout

Use one logical layout under a platform-specific ArtBreak root.

| Platform | `<ARTBREAK_HOME>` |
|---|---|
| macOS | `~/.artbreak` |
| Windows | `%LOCALAPPDATA%\ArtBreak` |
| Automated tests | the temporary directory supplied by `ARTBREAK_HOME` |

`ARTBREAK_HOME` is a test and development override. Production code normally derives the root from the platform. Never derive it from hook payload data.

Logical layout:

```text
<ARTBREAK_HOME>/
├── app/
│   ├── ArtBreak.app/                 # macOS only
│   ├── artbreak.exe                  # Windows only
│   ├── manifest.json
│   ├── artbreak.next.exe             # Windows pending update only
│   └── pending-update.json          # present only when needed
├── run/
│   ├── vscode/
│   │   ├── <lease-id>.json
│   │   └── ...
│   └── sessions/
│       ├── <marker-hash>.json
│       └── ...
├── state/
│   ├── pause.json
│   └── dismiss-until-idle.json
├── backups/
│   ├── claude-settings-<timestamp>.json
│   └── codex-hooks-<timestamp>.json
└── logs/
    └── artbreak.log
```

Only the platform-relevant companion payload exists in a real installation. The diagram shows both names so the shared logical layout is explicit.

## 8.1 Directory permissions and ACLs

On macOS:

- directories should be user-only where practical (`0700`);
- state, lease, marker, and backup files should be user-only where practical (`0600`);
- never make runtime state world-writable.

On Windows:

- create files beneath the current user's `%LOCALAPPDATA%` and inherit the user's normal ACLs;
- do not attempt POSIX-style `chmod` behavior;
- never weaken the inherited ACL to grant broad `Users` or `Everyone` write access;
- use `symlink_metadata` or platform-equivalent checks before sensitive replacements;
- reject or diagnose unexpected symbolic links, junctions, or reparse points in the managed app and state path rather than following them blindly.

On all platforms:

- do not follow untrusted links when replacing sensitive configuration or companion files;
- do not require administrator privileges.

## 8.2 Atomic write pattern

Every mutable JSON state file must use:

```text
serialize -> write unique temporary sibling -> flush if needed -> rename/replace in the same directory
```

Do not partially overwrite a live state file.

Use the repository's existing atomic-write helper if it is correct on both platforms. Rust's platform implementation of `std::fs::rename` may be sufficient for regular files, but executable replacement and Windows file-locking behavior must be tested separately.

## 8.3 State ownership

- Extension owns lease files and hook configuration backups.
- Hook mode owns turn markers.
- Extension control commands and companion control mode own pause state.
- UI mode owns dismiss-until-idle state on manual dismissal.
- Any mode may safely remove stale state after validation.

## 8.4 Path representation and comparison

- use native path APIs throughout;
- support Unicode paths;
- never split paths manually on `/` or `\\`;
- preserve original paths for display and logs;
- canonicalize only when the target exists;
- use path-component-aware containment checks;
- on Windows, compare canonical paths case-insensitively and normalize drive-letter casing and separators for comparison only;
- test paths containing spaces, non-ASCII characters, parentheses, and ampersands;
- allow UNC paths only when VS Code itself has opened and approved them and native path APIs can resolve them; do not invent a separate UNC parser.

## 8.5 Extension/companion path contract

The TypeScript extension and Rust companion must agree exactly on:

- ArtBreak root;
- runtime directories;
- installed executable path;
- manifest path.

Add fixture-based contract tests for both supported platforms. A path mismatch is a release-blocking defect because hooks would point to a binary different from the one the extension updates.

---

# 9. Global Runtime State Model

The runtime must be modeled as a small state machine, not scattered booleans.

## 9.1 Derived conditions

```text
active_count      = number of valid active marker files
matching_lease    = at least one fresh matching local VS Code lease
pause_active      = pause state currently evaluates to active
dismiss_active    = dismiss-until-idle file exists and active_count > 0
production_mode   = not --test
```

## 9.2 Logical states

```text
IDLE
PAUSED
PENDING_DISPLAY
VISIBLE
DISMISSED_UNTIL_IDLE
TEST_VISIBLE
```

## 9.3 State transition table

| Current state | Event | Condition | Action | Next state |
|---|---|---|---|---|
| `IDLE` | agent start | lease matches, not paused | create marker, spawn hidden UI | `PENDING_DISPLAY` |
| `IDLE` | agent start | paused | do not create marker, return neutral | `PAUSED` |
| `PENDING_DISPLAY` | 2s elapsed | active count > 0, lease valid, not paused, not dismissed | show window | `VISIBLE` |
| `PENDING_DISPLAY` | agent stop | active count becomes 0 before 2s | exit without showing | `IDLE` |
| `VISIBLE` | another start | valid | create marker, keep same window and painting | `VISIBLE` |
| `VISIBLE` | one stop | active count remains > 0 | keep window | `VISIBLE` |
| `VISIBLE` | final stop | active count becomes 0 | exit | `IDLE` |
| `VISIBLE` | Escape or native close | active count > 0 | write dismiss state, exit | `DISMISSED_UNTIL_IDLE` |
| `DISMISSED_UNTIL_IDLE` | new start | active count already > 0 | create marker, do not spawn UI | `DISMISSED_UNTIL_IDLE` |
| `DISMISSED_UNTIL_IDLE` | final stop | active count becomes 0 | remove dismiss state | `IDLE` |
| any production state | pause activated | pause active | close UI; suppress new starts | `PAUSED` |
| `PAUSED` | pause expires or resume | no currently tracked work | remove pause | `IDLE` |
| `PAUSED` | explicit resume | valid pre-pause markers remain | invoke production show; apply 2s gate | `PENDING_DISPLAY` |
| any | matching lease expires | production mode | exit UI; leave markers for cleanup | `IDLE` from UI perspective |
| any | test command | test mode | show test window | `TEST_VISIBLE` |
| `TEST_VISIBLE` | Escape or close | always | exit test process | `IDLE` |

## 9.4 Source of truth

The source of truth is the filesystem, not process memory.

In-memory state may cache parsed values, but every lifecycle decision must be recoverable from files after a process restart.

---

# 10. VS Code Lease Design

Global user hooks can fire outside VS Code. A lease prevents ArtBreak from opening for unrelated terminal sessions.

## 10.1 Lease file schema

```ts
type VscodeLease = {
  schemaVersion: 1;
  leaseId: string;
  vscodePid: number;
  extensionHostPid: number | null;
  createdAt: number;
  updatedAt: number;
  workspaceRoots: string[];
  remoteName: string | null;
};
```

Example:

```json
{
  "schemaVersion": 1,
  "leaseId": "4ddfc25f-3d3f-45bf-a0dc-6ea499f40af3",
  "vscodePid": 12345,
  "extensionHostPid": 12388,
  "createdAt": 1786123456000,
  "updatedAt": 1786123466000,
  "workspaceRoots": [
    "/Users/name/projects/example"
  ],
  "remoteName": null
}
```

## 10.2 Heartbeat constants

```text
lease heartbeat interval: 10 seconds
lease expiry threshold: 30 seconds
```

## 10.3 Lease lifecycle

On extension activation:

1. detect unsupported remote mode;
2. generate a unique lease ID;
3. canonicalize workspace roots that exist;
4. write the lease atomically;
5. update `updatedAt` every 10 seconds.

On extension deactivation:

- remove the lease best-effort.

On crash:

- the lease naturally expires after 30 seconds.

## 10.4 Hook-to-workspace matching

For each start event:

1. read `cwd` from hook JSON;
2. canonicalize it when possible;
3. find fresh leases;
4. ignore leases where `remoteName` is not null;
5. normalize only for comparison using the current platform's path rules;
6. match `cwd` to a workspace root using path-boundary-aware containment;
7. proceed only when a fresh matching lease exists.

Do not use naive string-prefix matching. `/project-a` must not match `/project-ab`.

Windows-specific comparison requirements:

- `C:\Repo` and `c:
epo` must compare as the same canonical path;
- `/` and `\` separator differences must not break matching;
- drive roots and UNC roots must retain correct component boundaries;
- junctions or symlinks should resolve through native canonicalization when accessible;
- do not lowercase paths for storage or user-facing display; case-fold only in the comparison representation.

## 10.5 Known MVP limitation

If a user keeps a project open in VS Code and runs Claude Code or Codex for the same project from an external local terminal, a global hook may still match that VS Code lease. This is an accepted MVP limitation because no reliable local-origin identifier is guaranteed in the hook payload.

Document this limitation. Do not add a server merely to eliminate it.

## 10.6 Remote environment handling

The extension must declare:

```json
{
  "extensionKind": ["ui"]
}
```

It must also inspect `vscode.env.remoteName`.

When `remoteName` is non-null:

- do not install or activate local hook behavior for that workspace;
- do not create a lease that could match remote work;
- show a concise unsupported-environment message when a command is invoked.

---

# 11. Session Marker Design

## 11.1 Normalized event model

```ts
type Provider = "claude" | "codex";
type LifecycleEvent = "start" | "stop" | "failure" | "session-end";

type NormalizedHookEvent = {
  provider: Provider;
  event: LifecycleEvent;
  sessionId: string;
  turnId: string | null;
  cwd: string;
  occurredAt: number;
};
```

## 11.2 Provider identifiers

Claude Code:

- `session_id` is required;
- `prompt_id` is preferred when present;
- `prompt_id` requires a sufficiently recent Claude Code version;
- when `prompt_id` is absent, fall back to a per-session marker.

Codex:

- `session_id` is required;
- `turn_id` is used for turn-scoped markers.

## 11.3 Marker key

Preferred key input:

```text
provider | sessionId | turnId-or-session-fallback
```

Hash it with SHA-256 for a filename-safe marker name.

```text
<ARTBREAK_HOME>/run/sessions/<sha256>.json
```

## 11.4 Marker schema

```ts
type ActiveMarker = {
  schemaVersion: 1;
  provider: "claude" | "codex";
  sessionId: string;
  turnId: string | null;
  cwd: string;
  leaseId: string;
  createdAt: number;
  updatedAt: number;
};
```

Do not store the user prompt, assistant response, transcript contents, or model output.

## 11.5 Start processing order

```text
parse CLI provider/event
read stdin JSON
normalize minimum fields
clean stale runtime files
count valid markers before this start
if pre-start active count is zero: remove any orphaned dismiss-until-idle state
find matching fresh lease
if no lease: return neutral
if pause active: return neutral without creating marker
create/update marker atomically
if dismiss-until-idle remains active from an existing busy period: return neutral without spawning UI
spawn `artbreak show --reason start` detached
return provider-appropriate neutral hook output
```

## 11.6 Stop processing order

```text
parse and normalize input
remove exact marker when possible
otherwise remove newest matching provider/session marker
if active marker count becomes zero:
  remove dismiss-until-idle state
return provider-appropriate neutral hook output
```

## 11.7 Session-end processing order

```text
remove all markers for provider + sessionId
if active marker count becomes zero:
  remove dismiss-until-idle state
return neutral output
```

## 11.8 Failure processing

Claude `StopFailure` is treated as a stop for ArtBreak lifecycle purposes.

Remove the matching marker best-effort. Claude ignores hook output and exit status for this event, but the binary should still avoid unnecessary output.

## 11.9 Concurrent work

Example:

```text
Claude turn A starts -> marker A
Codex turn B starts  -> marker B
active_count = 2     -> one window

Claude A stops       -> remove A
active_count = 1     -> keep window

Codex B stops        -> remove B
active_count = 0     -> close window
```

## 11.10 Stale marker policy

```text
stale marker TTL: 12 hours
```

A marker older than 12 hours may be removed during:

- hook execution;
- companion startup;
- diagnostics;
- runtime reset.

The implementation may also treat a marker as stale when its referenced lease is expired and no other fresh lease can plausibly own it.

Do not rely only on PID existence because PID reuse can produce false positives.

---

# 12. Two-Second Display Gate

## 12.1 Required behavior

Production show mode starts with the native window hidden.

Pseudocode:

```rust
async fn production_startup() {
    cleanup_stale_state();

    if !eligible_to_display() {
        exit_process();
    }

    sleep(Duration::from_millis(2000)).await;

    if !eligible_to_display() {
        exit_process();
    }

    load_initial_artwork();
    show_and_focus_window();
}
```

## 12.2 Eligibility after the delay

After two seconds, all must still be true:

- active marker count is greater than zero;
- at least one marker is associated with a fresh local VS Code lease;
- no pause is active;
- no dismiss-until-idle state is active;
- the process is the active single instance;
- the catalog has at least one valid artwork.

## 12.3 Race behavior

- A stop arriving before 2,000 ms must prevent the window from showing.
- A stop arriving at approximately the same moment as the delay must be resolved by re-reading filesystem state immediately before `show()`.
- Additional starts during the delay do not restart the timer.
- A second `show` invocation while the first instance is pending must not create another timer or window.
- A start while the window is already visible must not change the current painting.

## 12.4 Polling after display

```text
runtime poll interval: 250 ms
zero-marker exit debounce: 250 ms
```

The UI backend polls the small state directory. A filesystem watcher is unnecessary unless the repository already contains a simpler tested watcher implementation.

---

# 13. Pause, Resume, Dismissal, and Status Controls

## 13.1 Pause state schema

Use a tagged union rather than ambiguous nullable fields.

```ts
type PauseState =
  | {
      schemaVersion: 1;
      mode: "until";
      createdAt: number;
      until: number;
    }
  | {
      schemaVersion: 1;
      mode: "current-leases";
      createdAt: number;
      leaseIds: string[];
    }
  | {
      schemaVersion: 1;
      mode: "indefinite";
      createdAt: number;
    };
```

## 13.2 Pause evaluation

`mode: "until"` is active while `now < until`.

`mode: "current-leases"` is active while at least one listed lease remains fresh.

`mode: "indefinite"` is active until explicit resume.

Expired pause files should be removed lazily during the next evaluation.

## 13.3 Custom-hour validation

The VS Code input box must:

- accept a positive decimal number;
- reject zero, negative, NaN, and non-numeric input;
- enforce a reasonable maximum such as 720 hours unless product requirements change;
- show the computed resume time before confirmation where practical.

## 13.4 Pause command UX

`ArtBreak: Pause...` uses `vscode.window.showQuickPick`.

Suggested items:

```text
Pause for 1 hour
Pause for 2 hours
Pause for 4 hours
Pause for 8 hours
Pause for 24 hours
Pause for a custom number of hours...
Pause until all currently open VS Code windows close
Pause indefinitely
```

Do not build a settings panel for this.

## 13.5 Dismiss state schema

```ts
type DismissState = {
  schemaVersion: 1;
  mode: "until-idle";
  createdAt: number;
};
```

## 13.6 Manual close interception

Production UI must intercept both:

- `Escape`;
- native close-request event.

Both routes call the same backend operation:

```text
write dismiss-until-idle if active_count > 0
close window
exit process
```

Test mode does not write dismiss state.

## 13.7 Resume behavior

`ArtBreak: Resume`:

1. deletes `pause.json`;
2. clears no active markers;
3. reports that ArtBreak is enabled;
4. if valid existing markers remain, invokes `artbreak show --reason resume`;
5. production show mode still uses the two-second gate.

## 13.8 Status and reset

Required commands:

```text
ArtBreak: Show Status
ArtBreak: Diagnose
ArtBreak: Reset Runtime State
```

Status should report, without exposing prompt data:

- companion installed version;
- platform support;
- hook installation state;
- Codex trust reminder status when inferable;
- fresh lease count;
- active marker count;
- pause mode and expiry;
- dismiss-until-idle state;
- catalog record count;
- last bounded log messages.

Reset runtime state removes:

- stale and active markers;
- expired leases;
- dismiss state;
- pause state only after explicit user confirmation.

It does not remove hooks unless the user invokes the remove-hooks command.

---

# 14. Agent Hook Integration

## 14.1 Claude Code events

Install hooks for:

```text
UserPromptSubmit -> start
Stop             -> stop
StopFailure      -> failure
SessionEnd       -> session-end
```

Claude Code command hooks receive JSON on stdin. Current official documentation identifies `UserPromptSubmit`, `Stop`, and `StopFailure` as turn-level events and `SessionEnd` as a session-level event.

## 14.2 Codex events

Install hooks for:

```text
UserPromptSubmit -> start
Stop             -> stop
SessionEnd       -> session-end
```

Codex provides `turn_id` for turn-scoped events.

## 14.3 Hook-mode performance budget

```text
target normal duration: under 100 ms
hard configured timeout: 2 seconds
network calls: zero
Tauri UI initialization: zero
stdout noise: zero except required neutral JSON
stderr noise: zero
```

## 14.4 Fail-open behavior

ArtBreak is observational. It must never block or alter agent work.

For every parse, file, spawn, or state error:

- log minimally to the bounded local log;
- return provider-appropriate neutral output;
- exit successfully where the provider supports that behavior;
- do not inject context;
- do not return a block decision;
- do not write user prompt text to logs.

## 14.5 Provider output adapter

Claude and Codex do not have identical output expectations. Implement one small provider/event adapter rather than pretending all hooks share the same stdout contract.

| Provider | Event | Neutral stdout | Exit code |
|---|---|---:|---:|
| Claude | `UserPromptSubmit` | empty | `0` |
| Claude | `Stop` | empty | `0` |
| Claude | `StopFailure` | empty | `0` |
| Claude | `SessionEnd` | empty | `0` |
| Codex | `UserPromptSubmit` | empty | `0` |
| Codex | `Stop` | `{}` plus newline | `0` |
| Codex | `SessionEnd` | empty | `0` |

Codex `Stop` expects JSON on stdout for a successful exit; plain text is invalid. Emitting `{}` preserves neutral behavior.

If malformed stdin prevents payload parsing, the CLI arguments still identify provider and event, so the output adapter can emit the correct neutral response.

## 14.6 No prompt retention

Although start events include the submitted prompt, ArtBreak must not:

- store it;
- log it;
- hash it;
- send it over the network;
- display it;
- use it for artwork selection.

Parse only lifecycle identifiers and `cwd`.


---

# 15. Hook Configuration Installation

## 15.1 Stable executable path

Hook definitions must point to a stable absolute executable path with no version number.

| Platform | Stable command path |
|---|---|
| macOS | `~/.artbreak/app/ArtBreak.app/Contents/MacOS/artbreak` |
| Windows | `%LOCALAPPDATA%\ArtBreak\app\artbreak.exe` resolved to an absolute path before writing configuration |

Examples:

```text
/Users/name/.artbreak/app/ArtBreak.app/Contents/MacOS/artbreak
C:\Users\Name\AppData\Local\ArtBreak\app\artbreak.exe
```

Do not write `%LOCALAPPDATA%`, `~`, or another environment-variable expression into hook configuration. Resolve the absolute path first so provider trust signatures and command execution are deterministic.

Do not put a version number in the hook command path. The extension replaces or stages the companion while preserving this path.

## 15.2 Claude Code configuration

Target user-level file on both supported platforms:

```text
~/.claude/settings.json
```

Here `~` means the current user's home directory as resolved by the extension's native path API.

Prefer an absolute command plus an argument array when the current Claude hook schema supports it.

Conceptual macOS entry:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/name/.artbreak/app/ArtBreak.app/Contents/MacOS/artbreak",
            "args": ["hook", "claude", "start"],
            "timeout": 2
          }
        ]
      }
    ]
  }
}
```

Conceptual Windows entry:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:\\Users\\Name\\AppData\\Local\\ArtBreak\\app\\artbreak.exe",
            "args": ["hook", "claude", "start"],
            "timeout": 2
          }
        ]
      }
    ]
  }
}
```

Create equivalent entries for `Stop`, `StopFailure`, and `SessionEnd`.

## 15.3 Codex configuration

Target user-level file on both supported platforms:

```text
~/.codex/hooks.json
```

Codex loads hooks from `hooks.json` and inline `[hooks]` tables in `config.toml`. ArtBreak should manage only `hooks.json` and must not rewrite `config.toml`.

When the schema accepts only one command string, construct it with a tested platform-specific quoting helper.

Conceptual macOS entry:

```json
{
  "description": "ArtBreak lifecycle hooks",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"/Users/name/.artbreak/app/ArtBreak.app/Contents/MacOS/artbreak\" hook codex start",
            "timeout": 2
          }
        ]
      }
    ]
  }
}
```

Conceptual Windows entry after JSON escaping:

```json
{
  "description": "ArtBreak lifecycle hooks",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"C:\\Users\\Name\\AppData\\Local\\ArtBreak\\app\\artbreak.exe\" hook codex start",
            "timeout": 2
          }
        ]
      }
    ]
  }
}
```

Create corresponding `Stop` and `SessionEnd` entries.

Do not invoke PowerShell, `cmd.exe /c`, `/bin/sh -c`, or another wrapper unless the provider's documented schema makes a direct executable invocation impossible. If a shell string is unavoidable, keep every payload value out of it; only the trusted absolute ArtBreak path and constant arguments may appear.

## 15.3A Windows command, subsystem, and stdio constraint

The Windows build must preserve hook stdin and stdout while preventing a console window from flashing for UI mode.

Therefore:

- build `artbreak.exe` as a console-subsystem executable;
- do not apply `#![windows_subsystem = "windows"]` to the production binary, because a detached Windows-subsystem process can have null standard handles;
- hook mode reads inherited stdin and writes provider-neutral stdout normally;
- UI launches suppress the console through process-creation options, not by changing the executable subsystem;
- internal process launches use direct executable and argument APIs;
- command builders must be tested with user paths containing spaces, Unicode, parentheses, and `&`.

A dedicated Windows spike and integration test must prove this before the full Windows implementation proceeds.

## 15.4 Safe merge procedure

For each settings file:

1. Read the existing bytes.
2. Preserve a timestamped backup before modification.
3. Parse using the repository's existing JSON/JSONC tooling.
4. If no suitable parser exists, use one focused parser that preserves comments and trailing commas where relevant.
5. Locate ArtBreak entries by stable command signature, not array index.
6. Remove stale duplicate ArtBreak entries.
7. Insert exactly one current ArtBreak entry per required event.
8. Preserve unrelated hook groups and metadata.
9. Write a temporary file.
10. Parse the temporary file again.
11. Atomically replace the original.
12. Re-read and verify the final structure.

Never replace the entire user's hook object with an ArtBreak-only object.

## 15.5 Idempotency

Running install or repair repeatedly must result in the same configuration.

Required property:

```text
install(install(config)) == install(config)
```

## 15.6 Selective removal

`ArtBreak: Remove Agent Hooks` removes only hook handlers whose command matches the ArtBreak stable command signature.

It must:

- preserve unrelated handlers in the same matcher group;
- remove empty ArtBreak-created groups when safe;
- preserve unrelated event groups;
- leave backups;
- not remove the companion automatically unless a separate uninstall flow explicitly requests it.

## 15.7 Malformed configuration

If a target file cannot be parsed:

- do not overwrite it;
- create no speculative replacement;
- show the exact path and a concise remediation message;
- offer diagnostics;
- preserve the companion and other provider configuration.

## 15.8 Codex trust review

Codex requires non-managed command hooks to be reviewed and trusted by exact definition.

After installation or any hook-command change, show:

```text
ArtBreak hooks were installed for Codex.
Open Codex and run /hooks to review and trust them.
```

Do not bypass trust automatically.

Do not instruct users to use a dangerous trust-bypass flag as the normal setup path.

## 15.9 Hook installer tests

At minimum, test:

- empty file;
- missing file;
- existing unrelated events;
- existing unrelated handlers in the same event;
- existing ArtBreak old-version handlers;
- duplicate ArtBreak entries;
- comments and trailing commas where supported;
- malformed input;
- install twice;
- repair after binary path migration;
- selective removal;
- preservation of unknown fields;
- macOS and Windows stable paths;
- JSON escaping of Windows backslashes;
- command paths containing spaces, Unicode, parentheses, and ampersands;
- case-insensitive detection of stale Windows ArtBreak entries;
- no shell-wrapper insertion.

---

# 16. Companion Installation and Update

## 16.1 Extension resource layout

The extension packages one native payload per platform-specific VSIX.

```text
extension/resources/
├── darwin-arm64/
│   ├── ArtBreak.app/
│   └── manifest.json
└── win32-x64/
    ├── artbreak.exe
    └── manifest.json
```

A platform-specific VSIX must contain only its matching native payload.

## 16.2 Installed locations

| Platform | Companion payload | Manifest |
|---|---|---|
| macOS | `~/.artbreak/app/ArtBreak.app` | `~/.artbreak/app/manifest.json` |
| Windows | `%LOCALAPPDATA%\ArtBreak\app\artbreak.exe` | `%LOCALAPPDATA%\ArtBreak\app\manifest.json` |

The executable path remains stable across upgrades because agent hook trust and configuration refer to it.

## 16.3 Embedded manifest

Each resource directory includes:

```json
{
  "schemaVersion": 1,
  "version": "0.1.0",
  "platform": "darwin-arm64",
  "catalogVersion": "2026-08-07"
}
```

The Windows artifact uses `"platform": "win32-x64"`.

The extension must reject a bundled manifest whose platform does not match `process.platform` and `process.arch`.

## 16.4 Common update flow

1. Resolve the expected platform target.
2. Compare bundled and installed manifests.
3. If identical and self-check succeeds, reuse the installed companion.
4. Copy the new payload to a temporary sibling path on the same volume.
5. Verify manifest and executable presence.
6. On macOS, verify executable permission.
7. Best-effort run `artbreak control status --self-check` without initializing the UI.
8. Preserve the current working payload until replacement succeeds.
9. Replace or stage the new payload using the platform-specific rules below.
10. Re-run self-check from the stable path.
11. Delete rollback data only after verification.
12. Never change the hook command path merely because the binary version changed.

## 16.5 macOS replacement, signing, and notarization

Before public distribution on macOS:

- sign the Tauri app and nested executable;
- notarize the distributed artifact as required;
- verify the copied app still passes Gatekeeper expectations;
- replace the bundle through a temporary sibling and rollback location;
- test from a clean user account and a freshly installed VSIX;
- do not disable macOS security controls as part of normal installation.

## 16.6 Windows replacement and locked-executable behavior

Windows may prevent replacement or renaming of a running `artbreak.exe`.

Required behavior:

1. copy the new signed executable to `artbreak.next.exe`;
2. verify its embedded/adjacent manifest and self-check;
3. attempt to move the current executable to a rollback name and promote `artbreak.next.exe` to `artbreak.exe`;
4. if Windows reports a sharing or access violation because the executable is running, leave the verified pending file and write `pending-update.json`;
5. finalize the pending update on the next extension activation or repair command when the companion is no longer running;
6. do not kill an active ArtBreak window solely to update;
7. keep the old executable usable until promotion succeeds;
8. remove stale pending files only after validating version and age.

Do not introduce a permanent launcher stub or second executable merely to avoid Windows locking. A deferred update is simpler and preserves the one-executable architecture.

## 16.7 Windows runtime prerequisite

The Windows Tauri frontend uses Microsoft Edge WebView2.

First-release policy:

- support Windows 10 and Windows 11 x64 where the Evergreen WebView2 Runtime is available;
- rely on the system runtime rather than bundling a fixed runtime;
- do not add MSI or NSIS installation merely to provision WebView2;
- make `ArtBreak: Diagnose` report a likely WebView2 prerequisite when the signed companion passes CLI self-check but the UI cannot initialize;
- provide a concise link to the official Microsoft/Tauri prerequisite guidance in user documentation;
- test on a clean Windows user profile.

If real users frequently lack WebView2, revisit the distribution decision in a later release rather than adding complexity preemptively.

## 16.8 Windows code signing

Before public distribution on Windows:

- code-sign `artbreak.exe` with the selected Authenticode certificate;
- timestamp the signature;
- verify the signature after copying it into the extension resource and after installation;
- build and sign on a trusted Windows CI runner or Windows signing environment;
- never commit signing keys or certificate passwords;
- document that SmartScreen reputation can still vary, especially for a new certificate;
- do not instruct users to disable SmartScreen or antivirus protections.

## 16.9 No separate first-release desktop installer

The VS Code extension is the companion installer for this product.

Do not add:

- MSI;
- NSIS setup;
- Microsoft Store packaging;
- a Start Menu shortcut;
- a desktop shortcut;
- a registry-based auto-start entry.

Those mechanisms do not help the core workflow and would duplicate installation state.

---

# 17. Tauri Single-Instance Behavior

Use the official Tauri single-instance plugin or an existing tested repository equivalent.

## 17.1 Requirement

At most one production or test ArtBreak UI process may own the visible window at a time.

Multiple start hooks may concurrently execute:

```text
artbreak show --reason start
```

Only one process proceeds as the UI owner.

## 17.2 Secondary invocation behavior

When another instance already exists:

- do not open another window;
- do not reset the artwork;
- do not restart the two-second timer;
- optionally notify the primary instance only if the existing single-instance integration already supports this without new infrastructure;
- exit the secondary process quickly.

## 17.3 Version requirement

If the repository does not already pin a compatible plugin, use a current stable Tauri 2 single-instance plugin version at or above the macOS blocked-thread fix released in `2.4.3`, then lock it in the repository.

At implementation time, verify the current official release and compatibility with the pinned Tauri core version.

---

# 17A. Windows Process and Console Model

This section is a release-critical constraint, not an optional implementation detail.

## 17A.1 One executable, console subsystem

The same `artbreak.exe` must support hook, show, and control modes.

Because hook mode must read stdin and Codex `Stop` may require valid JSON on stdout, the Windows binary remains a console-subsystem executable. Do not use the Rust `windows_subsystem = "windows"` attribute for the release binary.

The absence of a visible console is achieved at launch time.

## 17A.2 Launching from the VS Code extension

Use a direct `spawn`/`execFile` style API with an argument array.

Conceptual Node options:

```ts
const child = spawn(executablePath, ["show", "--reason", reason], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
  shell: false,
});
child.unref();
```

Requirements:

- `windowsHide: true` on Windows;
- no shell;
- ignored stdio for independent UI mode;
- no user-controlled argument interpolation;
- handle spawn errors;
- verify that the child survives Extension Host shutdown while active markers and a fresh VS Code lease still exist.

Reuse an existing tested launcher if present.

## 17A.3 Launching show mode from hook mode

Hook mode launches the same executable directly with `show --reason start`.

On Windows:

- set stdin, stdout, and stderr to null for the show child;
- use `std::os::windows::process::CommandExt` with `CREATE_NO_WINDOW` or the smallest equivalent already present in the repository;
- do not use a shell;
- add `CREATE_NEW_PROCESS_GROUP` only if an actual parent-lifetime test proves it is necessary;
- do not use `DETACHED_PROCESS` by default when `CREATE_NO_WINDOW` satisfies the tested behavior;
- return from hook mode immediately after a successful spawn attempt.

The implementing AI must not guess which flag combination works. Prove it with the Windows spike in the implementation loops.

## 17A.4 Required Windows process tests

Automated or scripted tests on a real Windows runner must prove:

1. hook mode receives fixture JSON through stdin;
2. Claude hook mode exits `0` with neutral output;
3. Codex `Stop` exits `0` with valid neutral JSON;
4. `show --test` opens without a console window;
5. hook-spawned show mode opens without a console window;
6. the hook parent can exit while show mode remains alive;
7. the VS Code extension can exit or reload without killing a valid show process;
8. ten concurrent show invocations produce one window;
9. paths with spaces and Unicode work;
10. no `cmd.exe` or PowerShell window flashes.

A compile-only Windows CI job is insufficient.

---

# 18. Artwork Catalog Pipeline

## 18.1 Legal and source rule

Only include records that The Met identifies as public domain and for which an Open Access image URL is available.

Do not infer public-domain status from artist death dates.

Do not scrape third-party art sites.

Do not copy another archive's images.

## 18.2 Build-time source flow

```text
The Met Open Access CSV
        |
        v
candidate painting IDs
        |
        v
The Met Object API verification
        |
        v
strict validation and normalization
        |
        +--> paintings.audit.json
        |
        v
paintings.json embedded in companion
```

## 18.3 Required acceptance filter

A record is eligible only when:

```ts
object.classification === "Paintings"
&& object.isPublicDomain === true
&& object.primaryImageSmall !== ""
&& object.title !== ""
&& object.objectURL !== ""
```

`artistDisplayName` and `objectDate` are optional because anonymous or approximately dated works may still be valid paintings.

## 18.4 URL allowlist validation

Runtime image URL:

```text
scheme: https
host: images.metmuseum.org
```

Source URL:

```text
scheme: https
host: metmuseum.org or www.metmuseum.org
```

Reject records outside the allowlist.

## 18.5 Quality ordering

Candidate priority:

1. `isHighlight === true`;
2. `isTimelineWork === true`;
3. other eligible public-domain paintings.

The initial target is approximately 200 records, with an acceptable first milestone of at least 50 valid records.

## 18.6 Deterministic catalog generation

The generated catalog must be deterministic for the same source data and selection configuration.

- sort candidates by stable keys before deterministic sampling;
- use an explicit seeded algorithm if sampling is required;
- do not use current time as a selection seed;
- record source and generation metadata;
- avoid churn in unrelated catalog records.

## 18.7 API request policy

The Met API currently requires no API key and requests clients stay within the documented request rate.

Use conservative concurrency, such as eight concurrent object requests.

Implement:

- retry for transient `429` and `5xx` responses;
- bounded exponential backoff;
- a maximum retry count;
- clear failure reporting;
- no unbounded loop.

## 18.8 Runtime catalog schema

```ts
type Artwork = {
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  imageUrl: string;
  sourceUrl: string;
};

type ArtworkCatalog = {
  schemaVersion: 1;
  generatedAt: string;
  source: "The Metropolitan Museum of Art Open Access";
  license: "CC0";
  artworks: Artwork[];
};
```

The five user-facing pieces are:

1. painting image;
2. title;
3. artist;
4. date;
5. The Met source page.

`id` is an internal stable identifier.

## 18.9 Audit artifact

Generate a build audit artifact that is not required by the UI:

```ts
type ArtworkAuditRecord = {
  id: number;
  classification: "Paintings";
  isPublicDomain: true;
  isHighlight: boolean;
  isTimelineWork: boolean;
  imageUrl: string;
  sourceUrl: string;
  metadataDate: string | null;
  verifiedAt: string;
};
```

This helps demonstrate why each record was included without bloating the runtime model.

## 18.10 Catalog validation tests

- every ID is unique;
- every title is non-empty after trimming;
- every image URL is HTTPS and allowlisted;
- every source URL is HTTPS and allowlisted;
- every audit record says `classification: Paintings`;
- every audit record says `isPublicDomain: true`;
- runtime and audit ID sets match;
- catalog contains at least the configured minimum;
- output ordering is deterministic;
- JSON parses against the checked-in schema;
- no prompt, user, or machine-specific data exists in output.

---

# 19. Runtime Artwork Model and Random Navigator

## 19.1 Keep navigation logic pure

Implement randomized navigation as a pure TypeScript module with no DOM, Tauri, or network dependencies.

Suggested API:

```ts
interface ArtworkNavigator {
  current(): Artwork;
  canGoPrevious(): boolean;
  previous(): Artwork;
  next(): Artwork;
}
```

## 19.2 Shuffled-deck algorithm

At window-session creation:

1. copy the catalog indices;
2. shuffle with Fisher-Yates;
3. use cryptographically strong browser randomness where available (`crypto.getRandomValues`);
4. consume one item for the initial artwork;
5. append displayed IDs to history.

Do not call `array.sort(() => Math.random() - 0.5)`.

## 19.3 History behavior

Maintain:

```ts
const history: number[] = [];
let cursor = -1;
let deck: number[] = [];
```

`next()`:

```text
if cursor < history.length - 1:
  cursor += 1
  return history[cursor]
else:
  if deck empty: rebuild and reshuffle deck
  id = deck.pop()
  history.push(id)
  cursor += 1
  return id
```

`previous()`:

```text
if cursor > 0:
  cursor -= 1
return history[cursor]
```

## 19.4 Refill rule

When refilling the deck:

- include all catalog IDs;
- shuffle;
- when catalog size > 1, ensure the next emitted ID is not the currently displayed ID;
- preserve prior history so the left arrow still works during the current window session.

## 19.5 Rapid-input rule

Image transitions are asynchronous. Prevent races:

- do not update visible metadata until the replacement image is loaded;
- preload the candidate using an off-DOM `Image` object;
- serialize or cancel obsolete navigation requests;
- only the latest accepted navigation action may commit;
- keep exactly one painting visible during loading;
- skip failed images and try another candidate up to a bounded count.

## 19.6 Navigation tests

Test with seeded/fake randomness:

- initial item is valid;
- no repeat before deck exhaustion;
- left returns to actual history;
- right after left moves forward through history;
- right at history end consumes a new random item;
- deck refill avoids immediate repeat;
- one-item catalog works;
- two-item catalog works;
- rapid next requests commit only the allowed result;
- failed image candidate is skipped;
- all candidates failing produces the defined error state.

---

# 20. UI Specification

## 20.1 Visual direction

The window should feel like a black terminal that temporarily spawned a painting.

It must not look like a museum catalog, dashboard, card grid, social feed, or decorative gallery application.

## 20.2 Window configuration

```text
initial size: 960 x 720
minimum size: 640 x 480
resizable: yes
initial position: centered
background: #000000
always on top: no
native window decoration: yes
custom title bar: no
single visible window: yes
```

## 20.3 Layout

```text
+-------------------------------------------------------+
|                                                       |
|                                                       |
|                      [ PAINTING ]                     |
|                                                       |
|                                                       |
|                                                       |
|  <-              Artwork Title                  ->    |
|                 Artist Name - Date                     |
|                                                       |
+-------------------------------------------------------+
```

The actual arrow glyphs may be `←` and `→`.

## 20.4 DOM structure

```html
<main class="artwork-stage">
  <img class="artwork-image" alt="" />
  <div class="load-error" hidden></div>
</main>

<footer class="navigation-bar">
  <button class="nav-button previous" aria-label="Previous painting">←</button>

  <div class="metadata" aria-live="polite">
    <div class="title"></div>
    <div class="artist-date"></div>
  </div>

  <button class="nav-button next" aria-label="Next painting">→</button>
</footer>
```

## 20.5 CSS direction

```css
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #000;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

body {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.artwork-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

Do not introduce cards, gradients, drop shadows, decorative borders, or ornamental backgrounds.

## 20.6 Artwork display

- preserve aspect ratio;
- never crop the painting by default;
- reserve sufficient padding so it does not touch window edges;
- do not upscale a failed or tiny image beyond acceptable browser behavior without evidence;
- set image alt text to title plus artist where available;
- keep one visible image element.

## 20.7 Metadata formatting

First line:

```text
<title>
```

Second line:

```text
<artist> · <date>
```

Build the second line as:

```ts
[artist, date].filter(Boolean).join(" · ")
```

Do not show empty separators.

## 20.8 Mouse controls

- clicking the left button calls `previous()`;
- clicking the right button calls `next()`;
- buttons remain visually minimal but have an adequate hit target;
- previous may be disabled when there is no history, while remaining visible;
- disabled state must be accessible and visually understandable.

## 20.9 Keyboard controls

Global window handlers:

| Key | Action |
|---|---|
| `ArrowLeft` | previous painting |
| `ArrowRight` | next random painting or forward history |
| `Escape` | dismiss current busy period and exit |

Do not intercept standard native close shortcuts such as `Cmd+W` on macOS or `Alt+F4` on Windows; allow them to enter the same close-request path.

Mouse and keyboard actions must call the same navigation functions.

## 20.10 Error state

After a bounded number of failed image candidates, show only:

```text
Unable to load artwork.
```

Keep the footer controls available so the user can attempt another random painting.

Do not display raw URLs, stack traces, or internal errors in the artwork window.

## 20.11 No first-release extras

Do not add:

- zoom buttons;
- source buttons;
- a visible pause button;
- an overflow menu;
- favorites;
- thumbnails;
- progress indicators;
- commentary;
- artist biographies;
- custom animations;
- autoplay;
- sound.

Pause and administrative options remain in the VS Code Command Palette to preserve the minimal window.

---

## 20.12 Cross-platform window behavior

- use logical dimensions rather than assuming one device pixel per CSS pixel;
- verify layout at Windows display scaling values of 100%, 125%, 150%, and 200%;
- verify macOS Retina scaling;
- keep arrow hit targets usable at all tested scaling levels;
- do not use a custom title bar to hide platform differences;
- native close on both operating systems must pass through the same dismissal handler;
- no console or terminal window may appear behind the artwork window on Windows;
- use the same DOM, CSS, navigation model, and metadata formatting on both platforms.

---

# 21. Runtime Image Loading

## 21.1 Source

Use the embedded `imageUrl` directly. Do not call The Met Object API at runtime.

## 21.2 Loading sequence

```text
load catalog
select random initial artwork
create off-DOM image loader
wait for load success
commit image + metadata together
preload one likely next deck item
```

## 21.3 Failure policy

For a navigation request:

1. attempt the selected candidate;
2. on failure, mark it failed for the current window session;
3. select the next random candidate;
4. retry up to five candidates;
5. if all five fail, show the error state;
6. permit subsequent manual next actions to retry other candidates.

## 21.4 Cache policy

Do not implement a custom disk cache.

Allow the platform WebView and normal HTTP cache to operate.

An in-memory preloaded `Image` object is allowed.

## 21.5 Offline behavior

The metadata catalog loads offline, but images require network access unless already in the platform cache.

The first release does not bundle artwork image bytes.

Document this clearly.


---

# 22. Security, Privacy, and Content Safety

## 22.1 Content Security Policy

The frontend needs only local application assets and approved artwork images.

Target CSP:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https://images.metmuseum.org;
connect-src 'none';
object-src 'none';
frame-src 'none';
base-uri 'none';
```

If the build system can avoid inline styles, remove `'unsafe-inline'`. Do not weaken the CSP for convenience without a documented reason.

## 22.2 Tauri capability minimization

The frontend should not receive broad capabilities.

Do not expose:

- arbitrary shell execution;
- unrestricted filesystem APIs;
- arbitrary URL requests;
- process management;
- recursive directory access;
- environment secrets.

Rust backend owns lifecycle and state operations.

## 22.3 Hook-input privacy

Hook payloads may contain prompts, responses, transcript paths, model names, or tool data.

ArtBreak must:

- deserialize only required fields where practical;
- never persist prompt or response text;
- never copy transcripts;
- never send hook data over the network;
- avoid including raw hook payloads in errors;
- redact home directory paths in user-facing diagnostic summaries where reasonable.

## 22.4 Path safety

- use absolute stable executable paths;
- do not interpolate hook payload values into shell commands;
- canonicalize workspace paths when possible;
- use path-aware containment checks;
- reject state filenames derived directly from untrusted strings;
- hash marker keys before creating filenames;
- guard against symlink replacement during sensitive file writes;
- on Windows, treat unexpected junctions and reparse points in managed directories as a diagnostic failure;
- launch the companion directly without a shell;
- escape Windows hook command strings with one tested helper rather than ad hoc concatenation.

## 22.5 Image host validation

Even though the catalog is build-generated, validate URLs at runtime before assigning them to the image element.

Reject non-HTTPS or non-allowlisted hosts.

## 22.6 No telemetry

Do not add usage analytics, crash reporting, remote logging, tracking pixels, or identifiers.

Local bounded logs are diagnostic only.

---

# 23. Logging and Diagnostics

## 23.1 Logging goals

Logs exist to diagnose lifecycle failures without collecting user content.

Permitted fields:

- timestamp;
- log level;
- provider;
- lifecycle event name;
- hashed marker identifier;
- result category;
- duration;
- error type;
- companion version;
- active marker count;
- lease count.

Prohibited fields:

- prompt text;
- assistant output;
- transcript contents;
- environment-variable dumps;
- access tokens;
- arbitrary hook payload JSON.

## 23.2 Bounded log policy

Use a simple bounded file.

Suggested limits:

```text
maximum current file: 1 MiB
rotated files: at most 2
```

If the repository already has a small tested rotating logger, reuse it. Otherwise implement a minimal size check rather than adding a logging framework.

## 23.3 Diagnostic output

`artbreak control status` should return stable JSON to the extension.

Example:

```json
{
  "schemaVersion": 1,
  "companionVersion": "0.1.0",
  "platformTarget": "win32-x64",
  "supportedPlatform": true,
  "pendingCompanionUpdate": false,
  "freshLeaseCount": 1,
  "activeMarkerCount": 0,
  "pause": null,
  "dismissUntilIdle": false,
  "catalogCount": 200,
  "staleFilesRemoved": 0
}
```

The extension converts this into concise human-readable output.

---

# 24. VS Code Extension Commands

The extension contributes only commands. It does not contribute an activity bar container, sidebar, editor, Webview, or status-bar item in the first release.

Required commands:

```text
ArtBreak: Install / Repair Agent Hooks
ArtBreak: Remove Agent Hooks
ArtBreak: Test Window
ArtBreak: Pause...
ArtBreak: Resume
ArtBreak: Show Status
ArtBreak: Diagnose
ArtBreak: Reset Runtime State
```

Optional compatibility aliases may exist only if an earlier repository version already exposed stable command IDs.

## 24.1 Activation

Recommended manifest shape:

```json
{
  "activationEvents": ["onStartupFinished"],
  "extensionKind": ["ui"]
}
```

If the repository targets a VS Code version that derives activation from contributed commands, follow the current manifest rules while preserving startup lease creation.

## 24.2 Startup behavior

On activation:

1. verify supported local environment;
2. install or update the companion silently where safe;
3. start lease heartbeat;
4. register commands;
5. inspect hook installation state without rewriting it;
6. show a one-time setup message only when hooks are absent or invalid;
7. avoid slowing VS Code startup with network work.

## 24.3 User messaging

Messages must be actionable and brief.

Examples:

```text
ArtBreak is ready. Install agent hooks to enable automatic paintings.
```

```text
Codex hooks were installed. Run /hooks in Codex to review and trust them.
```

```text
ArtBreak is paused until 3:45 PM.
```

Do not repeatedly show the same setup message on every startup.

---

# 25. Repository Structure

Reuse the existing repository structure if it already separates these responsibilities cleanly. Otherwise use this baseline:

```text
artbreak/
├── package.json
├── README.md
├── IMPLEMENTATION_STATUS.md
│
├── extension/
│   ├── package.json
│   ├── tsconfig.json
│   ├── resources/
│   │   ├── darwin-arm64/
│   │   │   ├── ArtBreak.app/
│   │   │   └── manifest.json
│   │   └── win32-x64/
│   │       ├── artbreak.exe
│   │       └── manifest.json
│   ├── src/
│   │   ├── extension.ts
│   │   ├── companion.ts
│   │   ├── platform.ts
│   │   ├── hooks.ts
│   │   ├── hookMerge.ts
│   │   ├── lease.ts
│   │   ├── pauseCommands.ts
│   │   └── diagnose.ts
│   └── test/
│       ├── companion.test.ts
│       ├── platform.test.ts
│       ├── hookMerge.test.ts
│       ├── lease.test.ts
│       └── pauseCommands.test.ts
│
├── companion/
│   ├── package.json
│   ├── src/
│   │   ├── index.html
│   │   ├── app.ts
│   │   ├── artworkNavigator.ts
│   │   ├── imageLoader.ts
│   │   └── styles.css
│   ├── test/
│   │   ├── artworkNavigator.test.ts
│   │   └── imageLoader.test.ts
│   └── src-tauri/
│       ├── tauri.conf.json
│       ├── Cargo.toml
│       ├── resources/
│       │   └── paintings.json
│       └── src/
│           ├── main.rs
│           ├── cli.rs
│           ├── platform.rs
│           ├── hook.rs
│           ├── provider_output.rs
│           ├── markers.rs
│           ├── leases.rs
│           ├── pause.rs
│           ├── dismiss.rs
│           ├── state.rs
│           ├── ui.rs
│           └── logging.rs
│
├── scripts/
│   ├── sync-met-catalog.ts
│   └── validate-met-catalog.ts
│
├── data/
│   ├── paintings.audit.json
│   └── catalog-source.json
│
└── fixtures/
    ├── claude/
    │   ├── user-prompt-submit.json
    │   ├── user-prompt-submit-no-prompt-id.json
    │   ├── stop.json
    │   ├── stop-failure.json
    │   └── session-end.json
    ├── codex/
    │   ├── user-prompt-submit.json
    │   ├── stop.json
    │   └── session-end.json
    ├── platform/
    │   ├── macos-path-cases.json
    │   └── windows-path-cases.json
    └── met/
        ├── open-access-sample.csv
        ├── object-valid-painting.json
        ├── object-non-public-domain.json
        └── object-non-painting.json
```

## 25.1 Structure simplification rule

This is a responsibility map, not a mandate to create every file.

Combine files when:

- the combined module remains easy to test;
- responsibilities are not duplicated;
- the result is smaller and clearer.

Do not create empty architectural placeholder files.

Do not create a shared protocol package because the extension and companion communicate only through files and CLI commands.

Do not create separate `macos/` and `windows/` application trees. Small platform branches belong in the focused platform modules.

---

# 26. Constants

Centralize behavior constants in the smallest appropriate module.

```text
DISPLAY_DELAY_MS            = 2000
STATE_POLL_INTERVAL_MS      = 250
ZERO_MARKER_EXIT_DEBOUNCE_MS= 250
LEASE_HEARTBEAT_MS          = 10000
LEASE_EXPIRY_MS             = 30000
STALE_MARKER_TTL_MS         = 12 hours
HOOK_TIMEOUT_SECONDS        = 2
INITIAL_WINDOW_WIDTH        = 960
INITIAL_WINDOW_HEIGHT       = 720
MIN_WINDOW_WIDTH            = 640
MIN_WINDOW_HEIGHT           = 480
CATALOG_TARGET_COUNT        = approximately 200
CATALOG_MINIMUM_COUNT       = 50
SUPPORTED_TARGETS            = darwin-arm64, win32-x64
WINDOWS_PENDING_UPDATE_MAX_AGE = 7 days
IMAGE_RETRY_LIMIT           = 5
MET_SYNC_CONCURRENCY        = 8
MAX_CUSTOM_PAUSE_HOURS      = 720
```

Tests must use injected clocks or test constants instead of sleeping for real hours.

The production two-second delay should have one authoritative constant.

---

# 27. Loop-Based Implementation Method

No phase is implemented as one large task. Each phase is a sequence of short engineering loops.

## 27.1 Standard loop

For every vertical slice:

### A. Inspect

- inspect existing relevant code;
- inspect existing tests;
- inspect current official API documentation when behavior is version-sensitive;
- identify reusable modules and dependencies.

### B. Specify

- state the exact behavior for this slice;
- identify inputs, outputs, failure behavior, and acceptance criteria;
- define or update a test fixture.

### C. Red

- add the smallest failing test or executable check;
- verify the failure represents the missing behavior, not a broken test environment.

### D. Green

- implement the smallest change that passes the targeted test;
- reuse existing code first;
- avoid unrelated cleanup.

### E. Verify

Run:

- targeted tests;
- package type check;
- package lint;
- package build;
- relevant integration smoke test.

### F. Simplify

- remove duplication;
- collapse unnecessary abstraction;
- remove dead spike code;
- verify no prohibited dependency or service was introduced;
- rerun tests.

### G. Record

Update `IMPLEMENTATION_STATUS.md` with commands and real results.

## 27.2 Stop conditions

Stop the loop and repair before progressing when:

- baseline tests become red;
- hook output can alter agent behavior;
- existing user hook configuration is lost;
- the UI can open duplicate windows;
- the two-second gate is flaky;
- a test depends on arbitrary long sleeps;
- prompt data reaches logs;
- architecture introduces a server, daemon, or database;
- current code already provides a simpler tested path that the new code duplicates.

## 27.3 Review cadence

At the end of each major phase, perform a senior-level review focused on:

- correctness under races;
- idempotency;
- failure isolation;
- privacy;
- user configuration preservation;
- dependency count;
- module count;
- test determinism;
- release feasibility.

---

# 28. Detailed Implementation Loops

## Loop 0 - Baseline and Repository Map

### Goal

Understand and preserve the existing system before changing it.

### Work

- perform all repository reconnaissance tasks;
- run baseline build/test/lint/typecheck on every supported operating system already represented in CI;
- inspect whether the Windows Tauri target currently uses `windows_subsystem = "windows"` and record the result;
- identify native `darwin-arm64` and `win32-x64` build and packaging paths;
- create `IMPLEMENTATION_STATUS.md` if no equivalent exists;
- map reusable code to this plan;
- identify contradictions between repository behavior and this specification;
- record version-sensitive dependencies.

### Tests/checks

- existing full test command;
- existing build command;
- existing lint/typecheck commands;
- existing macOS and Windows CI jobs where present;
- a clean record of unsupported or missing platform coverage;
- no source changes except the status document unless needed to make baseline reproducible.

### Exit criteria

- baseline results recorded;
- reusable modules listed;
- proposed new modules minimized;
- no unexplained failing baseline.

---

## Loop 1 - Pure Runtime State Primitives

### Goal

Implement or characterize pure state logic before agent integration.

### Work

- atomic JSON write helper;
- lease freshness evaluation;
- path-boundary workspace matching;
- platform state-root and stable-executable resolution;
- Windows case-insensitive path comparison;
- pause-state evaluation;
- dismiss-state evaluation;
- marker key hashing;
- stale marker evaluation;
- filesystem cleanup helpers.

### Tests

- fresh vs expired lease;
- matching and non-matching workspace path;
- sibling-prefix false match;
- macOS and Windows path fixtures;
- Windows drive-letter case and separator normalization;
- Windows space and Unicode path cases;
- timed pause before and after expiry;
- current-lease pause with mixed fresh/expired leases;
- indefinite pause;
- deterministic marker key;
- stale marker boundary;
- atomic-write failure leaves old file intact where testable.

### Exit criteria

- pure tests green;
- no Tauri initialization required;
- no server or background process;
- clock is injectable.

---

## Loop 2 - Hook Payload Parsing and Neutral Output

### Goal

Safely parse official Claude and Codex lifecycle fixtures and never influence the agents.

### Work

- CLI mode dispatch before Tauri initialization;
- Claude start/stop/failure/session-end parsers;
- Codex start/stop/session-end parsers;
- `prompt_id` preference and Claude fallback;
- `turn_id` use for Codex;
- provider/event neutral output adapter;
- prompt-content non-retention tests.

### Tests

- every checked-in fixture parses;
- unknown fields are ignored;
- missing optional fields use fallback;
- malformed JSON returns correct neutral output;
- Codex Stop prints valid `{}` JSON;
- Claude UserPromptSubmit prints nothing;
- parser output contains no prompt or assistant text;
- hook mode does not initialize UI.

### Integration spike

Temporarily invoke the binary from actual Claude and Codex hooks in a development profile and capture only sanitized event metadata.

Remove or disable spike-only logging after fixture confirmation.

### Exit criteria

- actual event shapes confirmed;
- fixtures updated from sanitized real shapes if needed;
- no agent behavior change;
- hook runtime comfortably under budget.

---

## Loop 2A - Windows Single-Executable Stdio and Hidden-Launch Spike

### Goal

Prove the Windows process model before building more Windows-specific behavior.

### Inspect and reuse

- inspect existing Rust crate attributes and Tauri Windows configuration;
- inspect existing process-launch helpers;
- inspect current test harnesses and Windows CI;
- reuse existing direct-spawn code if it already passes the required behavior.

### Red tests or executable checks

Create failing Windows-only checks for:

- stdin fixture parsing in `artbreak.exe hook ...`;
- valid Codex neutral JSON on stdout;
- a path containing spaces and Unicode;
- `show --test` without a visible console;
- hook-spawned show mode surviving hook-process exit;
- no shell process in the launch chain where practical to inspect.

### Implementation

- keep the binary in the console subsystem;
- launch UI mode with `windowsHide` from Node;
- launch UI mode with `CREATE_NO_WINDOW` and null stdio from Rust;
- add only the minimum Windows API dependency or feature required by the proven implementation;
- do not add a wrapper executable.

### Verify and simplify

- run the tests on a native `win32-x64` runner;
- manually observe for console flash;
- remove spike-only code that is not part of the final path;
- document the exact creation flags that passed.

### Exit criteria

- hook stdin/stdout works in the release configuration;
- UI mode opens with no console flash;
- child lifetime is independent enough for the ArtBreak lifecycle;
- the implementation remains one executable;
- the Windows process model is recorded in `IMPLEMENTATION_STATUS.md`.

---

## Loop 3 - Marker Lifecycle Without UI

### Goal

Prove start/stop concurrency and cleanup using only CLI and files.

### Work

- matching lease requirement;
- marker creation on start;
- exact marker deletion on stop;
- fallback deletion by provider/session;
- session-end cleanup;
- StopFailure cleanup;
- dismiss clear on return to idle;
- stale cleanup.

### Tests

- start with no lease does nothing;
- start with fresh matching lease creates marker;
- start with non-matching lease does nothing;
- start while paused creates no marker;
- two providers create two markers;
- stopping one keeps one;
- stopping last clears dismiss state;
- session-end removes only matching session markers;
- duplicate start is idempotent;
- malformed marker is quarantined or ignored safely;
- concurrent atomic writes do not corrupt state.

### Exit criteria

- marker directory accurately represents active tracked work;
- all tests use temporary directories;
- no UI code required.

---

## Loop 4 - The Met Catalog Pipeline

### Goal

Produce a legally constrained, deterministic painting catalog.

### Work

- reuse existing data pipeline code if present;
- parse official Open Access CSV;
- select candidate IDs;
- verify objects through API;
- enforce painting/public-domain/image filters;
- validate URL allowlists;
- prioritize highlights and timeline works;
- generate runtime and audit JSON;
- add deterministic schema validation.

### Tests

- fixture CSV parsing;
- valid painting accepted;
- non-public-domain work rejected;
- non-painting rejected;
- missing image rejected;
- invalid host rejected;
- duplicate removed;
- deterministic output snapshot or semantic equivalent;
- runtime/audit ID parity;
- minimum count in release-generation check.

### Exit criteria

- at least 50 valid records for initial integration;
- target approximately 200 before release;
- all records independently traceable to The Met;
- normal runtime requires no Object API calls.

---

## Loop 5 - Pure Random Artwork Navigator

### Goal

Implement randomized, no-repeat mouse/keyboard navigation logic independently of the DOM.

### Work

- Fisher-Yates shuffle;
- injectable random source for tests;
- shuffled deck;
- history and cursor;
- previous/next rules;
- deck refill rule;
- failed-artwork session exclusion.

### Tests

Use small catalogs and deterministic fake randomness to test all behavior in Section 19.

### Exit criteria

- no repeat before exhaustion;
- back/forward semantics correct;
- no DOM or Tauri dependency;
- tests deterministic.

---

## Loop 6 - Companion UI in Test Mode

### Goal

Render the final minimal window without agent lifecycle complexity.

### Work

- Tauri window;
- black terminal-like layout;
- one painting;
- centered metadata;
- left/right buttons;
- `ArrowLeft`, `ArrowRight`, and `Escape` handling;
- image preload and atomic commit;
- load-error state;
- test mode.

### Tests/checks

- navigator unit tests remain green;
- DOM-level tests if the existing repository already has a lightweight setup;
- otherwise use focused module tests and manual smoke checklist;
- verify one visible image only;
- verify resize and aspect ratio;
- verify mouse and keyboard call the same functions;
- verify previous disabled behavior;
- verify Escape exits test mode without writing dismiss state;
- smoke-test the same DOM and CSS on macOS and Windows;
- verify Windows 125% and 150% display scaling and no console flash.

### Exit criteria

- UI matches the approved minimal structure;
- no React or Webview;
- no extra visible controls;
- no custom title bar;
- the same frontend source is used on both supported platforms.

---

## Loop 7 - Single Instance and Two-Second Gate

### Goal

Connect marker state to one hidden-then-visible production window.

### Work

- single-instance plugin;
- hidden startup;
- exact 2,000 ms gate;
- eligibility recheck;
- state polling;
- zero-marker debounce;
- pause and lease shutdown;
- secondary invocation behavior.

### Automated tests

Abstract the visibility gate behind an injectable clock and state reader.

Test:

- active for 1,999 ms then stop -> never show;
- active through 2,000 ms -> show once;
- stop during eligibility recheck -> never show;
- two starts during pending -> one window and one timer;
- additional start while visible -> no artwork reset;
- one of two markers stops -> stay visible;
- final marker stops -> exit;
- lease expires -> exit;
- pause activates -> exit.

### Real-time smoke tests

Use shortened test-only delay through dependency injection, not by changing the production constant.

Then run one real two-second test before phase completion.

### Exit criteria

- no flash for sub-two-second tasks;
- exactly one window;
- automatic exit works under concurrency;
- production constant remains 2,000 ms.

---

## Loop 8 - Manual Dismissal and Pause Controls

### Goal

Add user control without adding visible UI complexity.

### Work

- production Escape handler;
- native close-request handler;
- dismiss-until-idle file;
- pause quick pick;
- custom-hours input;
- current-leases pause;
- indefinite pause;
- resume;
- status and reset commands.

### Tests

- Escape writes dismiss and exits;
- native close uses the same path;
- test mode close does not write dismiss;
- start while dismissed creates marker but does not spawn;
- dismiss clears only when active count reaches zero;
- next idle-to-busy transition opens normally;
- each fixed pause duration writes correct expiry;
- custom-hour validation;
- expired pause self-cleans;
- current-leases pause ends after listed leases expire;
- indefinite pause requires resume;
- pause while visible closes window;
- work starting while paused does not appear after expiry;
- explicit resume removes pause.

### Exit criteria

- options are available through commands;
- main artwork UI remains unchanged;
- no tray or settings page.

---

## Loop 9 - VS Code Extension and Cross-Platform Companion Installation

### Goal

Make the local extension reliably install and control the matching macOS or Windows companion.

### Work

- detect `darwin-arm64` and `win32-x64` explicitly;
- reject unsupported architectures with an actionable message;
- select only the matching extension resource;
- implement shared manifest comparison;
- implement macOS bundle replacement;
- implement Windows executable staging and pending-update finalization;
- maintain the stable executable path;
- create lease heartbeat files under the correct platform root;
- register commands;
- block remote environments;
- show one-time setup messaging;
- add Windows WebView2-oriented diagnosis for UI startup failure.

### Tests

- fresh macOS installation;
- fresh Windows installation;
- same-version no-op on both platforms;
- version upgrade on both platforms;
- macOS failed replacement rollback;
- Windows locked-executable deferred update;
- Windows pending-update finalization;
- wrong-platform manifest rejection;
- missing executable detection;
- path contract between TypeScript and Rust;
- lease creation, update, and removal;
- Windows case-insensitive workspace matching;
- `remoteName` rejection;
- test command launches companion with no Windows console flash;
- command errors remain actionable.

### Exit criteria

- extension startup has no network dependency;
- local companion path is stable on both platforms;
- Windows update deferral never destroys the working binary;
- lease is fresh while extension is active;
- remote workspace is safely unsupported;
- no platform-specific product logic has leaked outside the platform boundary.

---

## Loop 10 - Hook Installer and Repair

### Goal

Safely integrate with real user Claude and Codex configuration.

### Work

- safe merge;
- backup;
- idempotency;
- duplicate cleanup;
- selective removal;
- malformed-file handling;
- Codex trust message;
- diagnostics.

### Tests

Run the complete matrix in Section 15.9.

### Manual validation

- install into disposable macOS and Windows user profiles;
- inspect final Claude configuration on both platforms;
- inspect final Codex configuration on both platforms;
- validate Windows paths containing spaces and Unicode;
- run Codex `/hooks` trust flow;
- verify unrelated hooks still run;
- remove ArtBreak and verify unrelated hooks remain.

### Exit criteria

- repeated repair is safe;
- removal is selective;
- trust flow is documented;
- no user config is silently discarded.

---

## Loop 11 - End-to-End Agent Integration

### Goal

Validate the real user journey with Claude Code and Codex.

### Claude scenarios

- normal response longer than two seconds;
- normal response shorter than two seconds;
- tool-heavy response;
- API failure triggering `StopFailure`;
- user interrupt where `Stop` may not fire;
- session end;
- two Claude sessions;
- Claude plus Codex concurrently.

### Codex scenarios

- hooks not yet trusted;
- hooks trusted;
- normal turn longer than two seconds;
- short turn;
- multiple sequential turns;
- two Codex sessions;
- session end;
- Claude plus Codex concurrently.

### User-control scenarios

- Escape during one active task;
- close button during two active tasks;
- pause for one hour while visible;
- resume while markers remain;
- indefinite pause and resume;
- stale runtime reset.

### Platform scenarios

Run the complete Claude, Codex, and user-control scenario set on both `darwin-arm64` and `win32-x64`. On Windows additionally verify `Alt+F4`, display scaling, WebView2 startup, executable paths with spaces, and absence of console flash.

### Exit criteria

- all expected windows open and close correctly on both supported platforms;
- no prompt or response appears in logs;
- no agent is blocked or receives added context;
- no duplicate windows;
- manual dismissal does not become a permanent pause.

---

## Loop 12 - Dual-Platform Packaging, Signing, and Clean-Machine Validation

### Goal

Produce distributable `darwin-arm64` and `win32-x64` VSIX artifacts containing their signed native companions.

### Shared work

- perform native release builds on the corresponding operating system;
- embed only the matching companion payload in each extension resource;
- generate and verify platform manifests;
- package with the correct `vsce --target` value;
- verify the stable installed path;
- verify update and rollback behavior;
- document uninstall behavior;
- produce checksums and release provenance through the existing release workflow where available.

### macOS work

- sign the Tauri app and nested executable;
- notarize;
- verify Gatekeeper behavior;
- package `darwin-arm64` VSIX.

### Windows work

- build `x86_64-pc-windows-msvc` on a native Windows runner;
- code-sign and timestamp `artbreak.exe`;
- verify Authenticode signature before and after VSIX packaging;
- package `win32-x64` VSIX;
- verify no console flash;
- verify system WebView2 startup;
- verify a locked executable causes a safe deferred update.

### Clean-machine checklist for each platform

- use a clean local OS user profile;
- install the matching VSIX in a clean VS Code profile;
- run Install / Repair Agent Hooks;
- trust Codex hooks;
- run Test Window;
- run real Claude and Codex tasks longer and shorter than two seconds;
- test pause, resume, Escape, native close, and arrow navigation;
- test multiple concurrent sessions;
- uninstall extension and inspect remaining state according to documented policy.

### Additional Windows clean-machine checks

- Windows 10 or Windows 11 x64 with current VS Code;
- non-administrator user;
- user profile path containing a space where practical;
- display scaling at 125% and 150% at minimum;
- `Alt+F4` close behavior;
- WebView2 failure guidance in a controlled missing/broken-runtime test if practical;
- SmartScreen/antivirus observations recorded without bypassing protections.

### Exit criteria

- macOS artifact is Gatekeeper-compatible;
- Windows executable has a valid expected signature;
- both artifacts run without developer tools;
- no broken binary or hook path;
- no console flash on Windows;
- release artifacts are reproducible through CI or documented commands;
- both platform-specific VSIXs satisfy the same product acceptance matrix.

---

# 29. Testing Strategy

## 29.1 Test pyramid

### Pure unit tests

Use heavily for:

- state evaluation;
- marker keys;
- lease matching;
- pause semantics;
- dismiss semantics;
- hook parsing;
- neutral output;
- config merge;
- randomized navigation;
- catalog normalization.

### Filesystem integration tests

Use temporary directories for:

- atomic writes;
- concurrent marker updates;
- stale cleanup;
- companion status;
- hook install and removal.

### Process integration tests

Spawn the actual binary for:

- hook CLI stdin/stdout behavior;
- exit codes;
- no UI initialization in hook mode;
- detached/independent show invocation;
- Windows stdin/stdout preservation;
- Windows hidden process creation with no shell;
- Windows pending-update promotion;
- control commands.

### VS Code extension integration tests

Use the repository's existing extension test infrastructure. If none exists, add only the smallest `@vscode/test-electron` coverage needed for:

- activation;
- command registration;
- lease creation;
- test-window command;
- unsupported remote command behavior where practical;
- correct platform resource selection;
- Windows `windowsHide` launch options.

### Manual UI smoke tests

Use for native window behavior that is expensive to automate in the first release:

- centering;
- resizing;
- native close;
- visual minimalism;
- keyboard focus;
- macOS packaging behavior;
- Windows native close and `Alt+F4`;
- Windows display scaling at 100%, 125%, 150%, and 200%;
- Windows no-console-flash behavior;
- Windows WebView2 startup.

Do not add Playwright solely for this first minimal window unless the repository already uses it.

## 29.2 Platform test matrix

Every release candidate must run the behavior suite on native operating-system runners.

| Test layer | macOS `darwin-arm64` | Windows `win32-x64` |
|---|---:|---:|
| TypeScript unit tests | required | required |
| Rust unit tests | required | required |
| Filesystem integration | required | required |
| Hook stdin/stdout process tests | required | required |
| Single-instance process test | required | required |
| Two-second real-time smoke test | required | required |
| Extension install test | required | required |
| Real Claude smoke test | required | required |
| Real Codex smoke test | required | required |
| Signed clean-machine test | required | required |

Do not rely on cross-compilation as the only Windows verification. Build and execute the Windows artifact on Windows.

## 29.3 Deterministic time

Tests must inject clocks or timers.

Do not make the unit suite wait two real seconds per case.

At least one integration smoke test must verify the real 2,000 ms production behavior.

## 29.4 Network test separation

Normal unit tests use fixtures and never require The Met network.

Catalog synchronization integration tests may access the network explicitly and should be:

- separately named;
- bounded;
- retry-limited;
- optional in local fast test runs;
- required in release or scheduled catalog-refresh workflows.

## 29.5 Test command hierarchy

Preserve existing repository commands. If no convention exists, provide:

```text
npm test                 # fast unit tests
npm run test:integration # process/filesystem integration
npm run typecheck
npm run lint
npm run build
cargo test
cargo clippy -- -D warnings
cargo fmt --check
npm run verify           # all non-network release checks
npm run catalog:sync     # explicit network operation
npm run catalog:validate
```

Root commands should delegate rather than duplicate package logic.

---

# 30. Detailed Acceptance Test Matrix

| Area | Scenario | Expected result |
|---|---|---|
| Delay | task ends at 1.5s | no visible window |
| Delay | task active after 2s | one visible window |
| Delay | second start at 1s | original timer continues; one window |
| Concurrency | Claude and Codex active | one window |
| Concurrency | one of two stops | window remains |
| Concurrency | final one stops | process exits |
| Random | repeated right clicks | random no-repeat sequence until exhaustion |
| Random | left click/key | previous viewed painting |
| Random | left then right | forward through existing history |
| Random | exhausted deck | reshuffle without immediate repeat |
| Input | mouse arrow click | same behavior as keyboard arrow |
| Input | `ArrowLeft` | previous |
| Input | `ArrowRight` | next |
| Input | `Escape` production | dismiss until idle and exit |
| Input | native close production | same as Escape |
| Input | close test mode | exit without dismiss state |
| Pause | fixed duration | start suppressed until expiry |
| Pause | custom decimal hours | validated and stored correctly |
| Pause | current leases | active until listed leases expire |
| Pause | indefinite | active until resume |
| Pause | activated while visible | window exits |
| Resume | no markers | enabled, no window |
| Resume | existing pre-pause markers | production show invoked with 2s gate |
| Lease | no fresh lease | hook no-op |
| Lease | cwd outside roots | hook no-op |
| Lease | remote workspace | unsupported, no lease behavior |
| Hook | malformed Claude JSON | neutral empty output, no block |
| Hook | malformed Codex Stop JSON | `{}` output, no block |
| Hook | duplicate start | one marker |
| Hook | StopFailure | matching Claude marker removed |
| Hook | SessionEnd | session markers removed |
| Hooks config | install twice | no duplicates |
| Hooks config | unrelated hooks | preserved |
| Hooks config | malformed file | no overwrite |
| Hooks config | remove | ArtBreak only removed |
| Catalog | non-public-domain | rejected |
| Catalog | non-painting | rejected |
| Catalog | invalid image host | rejected |
| Catalog | duplicate ID | rejected or deduplicated deterministically |
| Image | one image fails | skip to another candidate |
| Image | five candidates fail | error state, controls remain |
| Privacy | inspect logs | no prompts or responses |
| Single instance | ten concurrent show calls | one UI process/window |
| Stale state | marker older than TTL | removed |
| Packaging | clean `darwin-arm64` VSIX install | signed companion runs without dev tools |
| Packaging | clean `win32-x64` VSIX install | signed companion runs without dev tools |
| Windows process | hook stdin/stdout | works with console-subsystem executable |
| Windows process | show launch | no console or shell window flashes |
| Windows path | space/Unicode profile | hooks, install, and update work |
| Windows update | executable locked | verified update is deferred safely |
| Windows UI | 125%/150% scaling | layout and hit targets remain correct |
| Windows close | `Alt+F4` | same behavior as native close and Escape policy |

---

# 31. Failure Modes and Recovery

## 31.1 Stop hook does not fire

Claude user interrupts may not emit `Stop`.

Recovery mechanisms:

- Escape or native close;
- SessionEnd cleanup;
- lease expiry when VS Code closes;
- 12-hour stale marker cleanup;
- `ArtBreak: Reset Runtime State`.

Do not add process inspection or transcript polling in the first release.

## 31.2 UI process crashes

Markers remain.

The next start may spawn the UI again unless dismiss or pause state applies. Diagnostics can report active markers without a running UI.

Do not create a watchdog daemon.

## 31.3 Image network failure

Skip bounded candidates, then show the minimal error message. Keep navigation usable.

## 31.4 Catalog corruption

- validate catalog during build;
- validate minimal schema at startup;
- if invalid, log a sanitized error and exit;
- Test Window should show an actionable VS Code error through the launching command when possible;
- do not attempt runtime catalog download as an automatic repair.

## 31.5 User configuration permission error

- do not partially edit;
- keep backup if already created;
- show exact path and operation;
- allow companion test mode to remain usable.

## 31.6 Companion update failure

- keep the previous installed version;
- do not update hook path;
- report the failure;
- allow repair command to retry.

## 31.7 Codex hooks untrusted

- Codex skips them;
- ArtBreak reports the trust instruction;
- Test Window remains available;
- do not misdiagnose this as companion failure.

---

## 31.8 Windows WebView2 unavailable or damaged

- CLI hook and control modes should remain fail-open;
- Test Window may fail before rendering;
- diagnostics should identify WebView2 as a likely prerequisite without claiming certainty when the exit reason is ambiguous;
- provide official installation guidance;
- do not download or install system components silently.

## 31.9 Windows executable is locked during update

- keep the current signed executable;
- retain the verified `artbreak.next.exe` and pending manifest;
- finalize later when no process holds the file;
- do not delete the working version;
- do not kill active work solely for update completion.

## 31.10 Windows security software quarantines the companion

- report the missing or blocked executable through diagnostics;
- verify expected release signature and hash in the build pipeline;
- do not attempt security bypasses, exclusions, or silent re-download loops;
- allow Repair to reinstall the signed bundled payload after explicit user action.

---

# 32. Performance Budgets

## 32.1 Hook mode

```text
normal wall-clock target: < 100 ms
configured timeout: 2 seconds
network requests: 0
UI runtime initialization: 0
```

## 32.2 Extension activation

- no network;
- no catalog parsing;
- no agent process scanning;
- lease creation and command registration only;
- companion version check must remain lightweight.

## 32.3 UI mode

- hidden process may initialize during the two-second gate;
- first artwork metadata loads from embedded JSON;
- first image is the only required network load;
- next-image preload is bounded to one candidate;
- no periodic work faster than the 250 ms small-state poll.

## 32.4 Memory

The 200-record metadata catalog should remain small. Do not retain multiple full-resolution decoded images intentionally.

---

# 33. Packaging and Release

## 33.1 First artifacts

```text
artbreak-<version>-darwin-arm64.vsix
artbreak-<version>-win32-x64.vsix
```

The macOS package contains:

- bundled extension JavaScript;
- signed and notarized `ArtBreak.app`;
- matching manifest;
- no artwork image binaries;
- no development dependencies.

The Windows package contains:

- bundled extension JavaScript;
- signed and timestamped `artbreak.exe`;
- matching manifest;
- no fixed WebView2 runtime;
- no artwork image binaries;
- no development dependencies.

## 33.2 Platform-specific publishing

Use VS Code's platform-specific extension packaging support.

Required targets:

```text
vsce package --target darwin-arm64
vsce package --target win32-x64
```

Publish both packages under the same extension identity and version. VS Code selects the package matching the user's platform.

Do not ship both native payloads in one fallback VSIX.

## 33.3 Native build policy

- build macOS on macOS;
- build Windows on Windows using the MSVC Rust target;
- do not make cross-compilation the sole release path;
- pin Rust, Node, package-manager, Tauri, and `vsce` versions through the repository's existing mechanism;
- reuse existing CI and signing workflows before creating new ones;
- keep signing secrets in the CI secret store.

## 33.4 Release gates

Shared gates:

- all fast tests green on both operating systems;
- Rust format and clippy green;
- TypeScript typecheck and lint green;
- catalog validation green;
- hook merge golden tests green for POSIX and Windows paths;
- real Claude and Codex smoke tests complete on both platforms;
- Codex trust flow documented;
- clean-machine install complete on both platforms;
- privacy log inspection complete;
- no prohibited architecture introduced.

macOS gates:

- signing and notarization complete;
- Gatekeeper check complete.

Windows gates:

- Authenticode signature and timestamp verified;
- no console flash in extension and hook launch paths;
- system WebView2 path verified on clean Windows;
- deferred locked-file update verified;
- path-with-spaces test complete;
- Windows Defender or equivalent standard security scan observations recorded.

## 33.5 Catalog refresh

Catalog refresh is a deliberate release task, not a runtime operation.

A catalog update should:

1. run the sync script;
2. review diff size;
3. validate audit records;
4. run catalog tests;
5. update `catalogVersion`;
6. include provenance in the release notes when useful.

The same catalog artifact must be embedded in both platform builds for a given release version.

---

# 34. Completion Criteria

The implementation is complete only when all conditions below are true.

1. No VS Code Webview is used.
2. A separate native desktop window opens.
3. The production window waits 2,000 ms before becoming visible.
4. A task that finishes before 2,000 ms causes no visible flash.
5. Exactly one painting is visible at a time.
6. The bottom row is left arrow, centered artwork information, right arrow.
7. Mouse clicks and keyboard `ArrowLeft`/`ArrowRight` both work.
8. The painting order is randomized with no repeats until deck exhaustion.
9. Left navigation returns through actual viewing history.
10. The last active tracked turn ending closes the process automatically.
11. Multiple concurrent agents share one window.
12. Escape dismisses only the current continuous busy period.
13. The native close button has the same production behavior as Escape.
14. The next idle-to-busy transition works after a dismissal.
15. Pause supports fixed hours, custom hours, current VS Code leases, and indefinite mode.
16. Resume works without a settings UI.
17. The Met records are verified as `Paintings` and `isPublicDomain: true`.
18. Runtime performs no The Met collection search.
19. Runtime requires no API key.
20. Existing Claude and Codex hook configuration is preserved.
21. Hook installation is idempotent.
22. Hook removal is selective.
23. Hook errors do not block or add context to agent work.
24. Codex Stop returns valid neutral JSON.
25. Prompt and response content is not persisted or logged.
26. The companion is a single instance.
27. No local HTTP server, WebSocket server, IPC daemon, or database exists.
28. No React or Redux exists.
29. No system tray or settings page exists.
30. Unsupported remote environments are explicitly blocked.
31. Codex hook trust is clearly explained.
32. The codebase follows existing repository conventions wherever practical.
33. Every implementation loop records real test results.
34. No phase proceeds with relevant red tests.
35. The first release installs and runs from clean `darwin-arm64` and `win32-x64` VSIXs.
36. The Windows hook path preserves stdin and provider-neutral stdout.
37. The Windows artwork window opens without a console or shell flash.
38. Windows paths containing spaces and Unicode are supported.
39. A locked Windows executable causes a safe deferred update rather than data loss.
40. Both supported platforms pass the same user-behavior acceptance suite.

---

# 35. Prohibited Additions

The final implementation prompt must include the following instruction verbatim or with equivalent force:

```text
Do not introduce a local HTTP server, WebSocket server, IPC daemon,
database, React, Redux, a VS Code Webview, runtime Met API search,
a custom runtime image cache, authentication, telemetry, a system tray,
a settings UI, a custom title bar, a generic event bus, a dependency
injection framework, or a plugin framework.

Use filesystem marker and state files as the only cross-process state
mechanism.

Keep the system limited to:
1. one VS Code extension,
2. one Tauri executable with hook, show, and control modes,
3. one build-time Met catalog script.

Before adding new code, inspect and reuse existing repository code that
already satisfies the responsibility. Implement in small tested loops.
Do not proceed to the next loop while relevant tests are failing.
```

---

# 36. Assumptions and Accepted Limitations

## 36.1 Assumptions

- Claude Code and Codex are installed and support the documented lifecycle hooks.
- The user can approve Codex hook trust.
- The user has internet access for image loading.
- The Met keeps the approved image URLs available often enough for this experience.
- VS Code is running locally for the supported first release.
- The Windows user runs current VS Code on Windows 10 or Windows 11 x64.
- The Windows system has a working Microsoft Edge WebView2 Evergreen Runtime.
- The user can execute a signed per-user binary from `%LOCALAPPDATA%` under normal organization policy.

## 36.2 Accepted limitations

- An external terminal in the same open VS Code workspace may match the lease.
- Claude user interrupt may leave a marker until manual or stale cleanup.
- ArtBreak does not know about work that starts entirely while paused.
- Pause expiry does not force a mid-turn display for work that began while paused.
- Images are unavailable offline unless already cached by the platform.
- The first release treats foreground `Stop` as the end of the displayed wait period and does not separately track Claude background tasks or recurring session cron work.
- The first release does not show commentary, artist biography, medium, or dimensions.
- The first release does not support remote VS Code workflows, WSL-hosted agents, Linux, Intel macOS, or Windows ARM64.
- The first release relies on the system WebView2 runtime instead of bundling one.
- A Windows companion update can remain pending until the current executable is no longer in use.
- Windows security reputation warnings cannot be guaranteed to disappear immediately even when the executable is correctly signed.

These limitations must be documented rather than hidden behind extra infrastructure.

---

# 37. Implementation Status Template

Create or update `IMPLEMENTATION_STATUS.md` using this structure:

```markdown
# ArtBreak Implementation Status

## Baseline
- Repository commit:
- Package manager:
- Existing architecture reused:
- Baseline commands:
- Baseline results:

## Current loop
- Loop number/name:
- Goal:
- Status: not started | in progress | blocked | complete

## Changes
- Existing code reused:
- Files changed:
- Dependencies added and why:

## Verification
- Tests added/updated:
- Commands run:
- Actual results:
- Manual checks:

## Simplification review
- Duplicated code removed:
- Abstractions avoided/removed:
- Dead code removed:
- Prohibited architecture check:

## Risks and limitations
- ...

## Next loop
- ...
```

---

# 38. Authoritative References

These references were checked on 2026-08-07. Re-check version-sensitive details at implementation time.

## Claude Code hooks

- Hooks reference: https://code.claude.com/docs/en/hooks
- Relevant current behavior:
  - hooks run in terminal and IDE contexts;
  - `UserPromptSubmit`, `Stop`, and `StopFailure` are turn-level events;
  - `SessionEnd` is session-level;
  - command hooks receive JSON on stdin;
  - `prompt_id` is available in sufficiently recent versions;
  - `Stop` does not run for user interrupt;
  - `StopFailure` runs on API errors.

## Codex hooks

- Hooks reference: https://developers.openai.com/codex/hooks/
- Current canonical content may redirect to: https://learn.chatgpt.com/docs/hooks
- Relevant current behavior:
  - `UserPromptSubmit`, `Stop`, and `SessionEnd` are available;
  - turn events include `turn_id`;
  - hooks may be defined in `hooks.json` or `config.toml`;
  - non-managed command hooks require review and trust;
  - `Stop` expects JSON on stdout when exiting successfully;
  - `SessionEnd` has a shorter timeout constraint than most hooks.

## Tauri

- Tauri 2: https://v2.tauri.app/
- Single-instance plugin: https://v2.tauri.app/plugin/single-instance/
- Single-instance release history: https://v2.tauri.app/release/single-instance/

## VS Code extension platform behavior

- Extension hosts and `extensionKind`: https://code.visualstudio.com/api/advanced-topics/extension-host
- Remote extension behavior: https://code.visualstudio.com/api/advanced-topics/remote-extensions
- Extension manifest: https://code.visualstudio.com/api/references/extension-manifest
- Publishing and platform-specific packages: https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Windows and cross-platform process behavior

- Tauri Windows prerequisites and WebView2: https://v2.tauri.app/start/prerequisites/
- Tauri Windows code signing: https://v2.tauri.app/distribute/sign/windows/
- Tauri Windows distribution reference: https://v2.tauri.app/distribute/windows-installer/
- Rust `windows_subsystem` behavior: https://doc.rust-lang.org/reference/runtime.html#the-windows_subsystem-attribute
- Rust stdout portability note for detached Windows processes: https://doc.rust-lang.org/stable/std/io/fn.stdout.html
- Node child process `windowsHide` and `detached`: https://nodejs.org/api/child_process.html
- Microsoft process creation flags: https://learn.microsoft.com/windows/win32/procthread/process-creation-flags
- Microsoft `CreateProcess` behavior: https://learn.microsoft.com/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw
- VS Code Windows setup: https://code.visualstudio.com/docs/setup/windows
- VS Code supported downloads and architectures: https://code.visualstudio.com/download

## The Metropolitan Museum of Art

- Open Access: https://www.metmuseum.org/hubs/open-access
- Collection API: https://metmuseum.github.io/
- Open Access repository and CSV: https://github.com/metmuseum/openaccess

---

# 39. Final Instruction to the Implementing AI

Execute this plan as a sequence of tested vertical slices.

Start by inspecting the repository and proving the baseline. Reuse existing code before adding new code. Preserve user configuration. Keep hook mode fast and fail-open. Keep the UI visually minimal. Treat filesystem state as the only cross-process protocol. Maintain the exact two-second gate. Use a shuffled deck for randomized no-repeat navigation. Keep Escape/close dismissal separate from time-based pause. Preserve identical product behavior on macOS and Windows. Prove Windows stdin/stdout and no-console-flash behavior early, not at packaging time. Do not introduce infrastructure that is not required by the specification.

At the end of every loop:

1. run the relevant tests and checks;
2. report actual results;
3. review the diff for simplification;
4. update implementation status;
5. continue only when the slice is green.
