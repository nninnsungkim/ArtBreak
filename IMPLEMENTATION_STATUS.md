# ArtBreak implementation status

Last audited: 2026-08-14 (Windows `win32-x64` and macOS `darwin-arm64` built and
verified in native CI; macOS `darwin-x64` deferred)

## Current release target

The 0.2.7 release ships Windows x64 and macOS Apple Silicon; macOS Intel is
deferred to a later release (see below). It silently installs the companion
under the user's profile, automatically installs Claude Code and Codex hooks on
activation, and opens a welcome artwork without depending on an agent hook. No
API key, server, LLM, or separate installer is required.

## Implemented and verified

| Area | Status | Evidence |
| --- | --- | --- |
| Runtime state, leases, markers, pause and dismissal | Implemented | Extension unit suite passes. |
| Claude Code and Codex hook installer | Implemented, with an important Claude Code caveat | Both integrations are registered automatically at extension activation. Selective merge, changed-only backup, removal, and neutral output are implemented. Root-caused a long-standing "the popup never appears with Claude Code" report: Anthropic's Claude Code VS Code extension does not invoke `UserPromptSubmit`/`Stop`/`SessionEnd` command hooks at all for a session opened in its native webview panel/sidebar (`claude-vscode.editor.open` / `claude-vscode.sidebar.open`), confirmed via a log statement placed as the literal first line of the companion's `main()` with zero config/env dependency, which never fired across multiple fresh VS Code windows. The identical hook fires correctly for a `claude` session run via the extension's own **"Claude Code: Open in Terminal"** command (`claude-vscode.terminal.open`) or any external terminal — verified end-to-end (lease match, marker, window shown, Stop clears it). This is a limitation of Claude Code's webview integration, not fixable from ArtBreak's side; see README's Install section for the user-facing guidance. Codex hooks are unaffected (Codex has no comparable webview mode). |
| Tauri companion | Implemented | Rust CLI supports `hook`, `show`, and `control`; `cargo test` passes (4 tests). |
| Two-second gate and single visible window | Implemented | Hook smoke used a fresh VS Code lease and created a UI only after the gate. `ui.lock` protects the window and is now removed before automatic exit. `Test Window` previously bypassed this lock entirely (could open a second window, or leave the lock held after closing); it now acquires and releases the same lock as agent-triggered windows. |
| Artwork catalog and navigation | Implemented | The bundled catalog contains 5,000 displayable Met paintings and zero `Unknown` artists. It starts at random in 227 official Met `Famous` paintings, with an in-window Explore control for the full painting catalog. Both collections use shuffled deck/history navigation. |
| Artwork UI | Implemented | Responsive image fit, work/artist/source fields, Famous/Explore controls, The Met link, previous/next navigation, magnifier affordance, continuous pointer-anchored Ctrl/Command zoom, modifier-drag zoom, and direct click-and-drag panning. Wheel/trackpad zoom sensitivity is one third of the previous setting. |
| Stable companion path and updates | Implemented for Windows and macOS | Windows uses `%LOCALAPPDATA%\ArtBreak\app\artbreak.exe`; macOS installs the complete `~/.artbreak/app/ArtBreak.app` bundle. Both verify the embedded executable hash before a staged, rollback-safe payload swap. |
| macOS packaging | Built and verified in native CI for `darwin-arm64`; `darwin-x64` not yet attempted | The package script builds a Tauri `ArtBreak.app` bundle on its native macOS host and embeds it in the matching VSIX. Two real bugs were found and fixed by this first real native-CI run (Windows packaging never exercises this code path, so neither had been caught before): (1) `beforeDevCommand`/`beforeBuildCommand` in `tauri.conf.json` used `../scripts/sync-catalog.mjs`, which Tauri resolves relative to the directory `tauri` is invoked from (`packages/companion/`), not `src-tauri/`; it pointed at a nonexistent path and failed every `tauri build` with `MODULE_NOT_FOUND`. Fixed to `./scripts/sync-catalog.mjs`. (2) The bundle `identifier` was `com.artbreak.app`, which Tauri itself warns against (conflicts with the `.app` bundle extension); changed to `com.artbreak.desktop`. A companion install unit test also had a fixture bug: it wrote a flat file for the bundled payload/manifest on every platform, but `companionLayout('darwin')` expects a nested `ArtBreak.app/Contents/MacOS/artbreak` bundle, so `readBundledManifest()` rejected it as invalid on macOS; the fixture now derives its shape from `companionLayout()` directly. With all three fixed, GitHub Actions run [31762065364](https://github.com/nninnsungkim/ArtBreak/actions/runs/31762065364) built `darwin-arm64` successfully (ad-hoc signed, no Developer ID configured) and uploaded `artbreak-darwin-arm64` (2,771,606 bytes) as a workflow artifact. `darwin-x64` queued for its `macos-13` runner for 15+ minutes without starting (GitHub runner availability, not a code issue) and was not waited on further; since it runs the identical fixed pipeline, it is expected to succeed whenever it gets a runner. |
| First-run display | Implemented and acceptance-tested | The extension schedules one immediate welcome work on its first activation. It bypasses agent hooks but respects ArtBreak pause state and the normal single-window lock. A clean VS Code profile opened the artwork window automatically. |
| Windows VSIX | Built and checked | `artbreak-win32-x64-0.2.7.vsix`, 2,711,547 bytes, SHA-256 `c451296a180ecbbb489c5d5e2a766fcffb789d19bda0c192f69e9aa98b09e577`. Its manifest activates with `*`, id `artwait.artbreak` (renamed from `artwait.artbreak-vscode` after the Marketplace rejected republishing that id following a delete — see the 0.2.7 CHANGELOG entry), and bundles `bin/win32-x64/artbreak.exe` (32 files, 2.59 MB unpacked, no stale `out/src/**` files). |

## Latest local verification

- `npm run test:run --workspace=artbreak` — passed.
- `npm run lint --workspace=artbreak` — passed.
- `npm run typecheck --workspace=artbreak` — passed.
- `cargo test` — 4 passed.
- `npm run package:vsix --workspace=artbreak` — passed.
- Stable-path Test Window rendered the magnifier in the artwork's lower right.
- Fresh Test Window accepted Ctrl + wheel/trackpad scroll and `Ctrl + Plus` to open the zoom view.
- Loaded image accepted Ctrl-drag and enlarged visibly.
- Isolated Claude hook smoke: start returned in under one second, marker and UI appeared after the two-second gate; stop returned in 40 ms and removed marker, UI process, and `ui.lock`.
- Version 0.1.4 passed typecheck, lint, extension tests, and all four Rust tests; its VSIX archive contains the declared PNG icon and an executable whose SHA-256 matches its embedded manifest.
- Version 0.1.4 was installed through the Microsoft VS Code CLI on this computer and published as `artwait.artwait-vscode` (the product's pre-rename name; see the 0.2.7 entry above for the rename to ArtBreak).
- Version 0.1.6 passed typecheck, lint, and the extension test suite, then packaged successfully with automatic Claude/Codex hook installation.
- Hook installation now targets `C:\Users\carlk\AppData\Local\ArtBreak\app\artbreak.exe` for both agents; repeated installation made no configuration writes or new backup files.
- A synthetic Codex start signal matching the current VS Code workspace opened the ArtBreak window after the two-second gate; its paired stop signal was sent and the test-created window was closed.
- Version 0.1.8 passed typecheck, lint, extension tests, catalog tests, and all four Rust tests. Its installed native Test Window opens in Highlights with a random work; two independent window launches produced different opening works through Windows UI Automation.
- Version 0.1.9 passed typecheck, lint, the extension unit suite, and all four Rust tests. Its release companion opened a visible welcome window without a Claude/Codex hook or marker, held the normal `ui.lock`, and removed that lock when closed.
- Version 0.2.0's Windows-compatible implementation passed typecheck, lint, and the extension unit suite, including the macOS app-bundle layout contract. Native macOS build and UI validation run in the newly extended native CI matrix.
- Version 0.2.1 passed typecheck, lint, and the extension unit suite after changing activation to immediate. Its final VSIX then passed clean-profile and installed-while-running acceptance tests.
- The final 0.2.1 Windows VSIX archive has the expected `0.2.1` version, `win32-x64` target, immediate activation, and companion hash.
- Fresh-profile acceptance: installing 0.2.1 before launching VS Code automatically opened the ArtBreak window and its companion from the isolated app path.
- Running-session acceptance: installing 0.2.1 into an already-open, otherwise empty VS Code profile also automatically opened the ArtBreak window, with no reload or terminal action in that profile.
- Version 0.2.5 passed typecheck, lint, the extension unit suite, companion catalog tests, and all four Rust tests. Its clean-profile Codex run registered `UserPromptSubmit Completed` and `Stop Completed`; the extension installed the stable companion and hooks automatically. Codex work-start now writes its marker synchronously, while the active VS Code extension opens the gated window.
- Version 0.2.7 passed `tsc --noEmit` for both packages, the extension unit suite (including new `pauseUntilEndOfDay` tests), `cargo check`, and `cargo test` (4 passed). Its packaged VSIX was rebuilt after fixing a `.vscodeignore` gap and verified to contain no stale `out/src/**` duplicate files.
- A path-separator bug in `platform.rs`'s workspace-matching (missing `/`↔`\` unification, unlike the TypeScript mirror which already normalizes via `path.normalize()`) silently dropped every real Claude Code work-start event on Windows whenever the hook's reported `cwd` used forward slashes. No session marker had ever been created in this app's runtime history under either name (ArtWait or ArtBreak) before this was found and fixed; reproduced directly against the installed binary (forward-slash `cwd` created no marker before the fix, did after) and confirmed end-to-end (marker + visible window) on the live installation.
- CI's first real native-macOS run (see the macOS packaging row above) found and fixed a broken `tauri.conf.json` hook path, a `.app`-suffixed bundle identifier, and a companion-install test fixture that didn't match the real `.app` bundle layout — three bugs that Windows-only local testing structurally could not have caught, since the Windows packaging path never calls `tauri build` and the test fixture bug only manifests when `companionLayout()` resolves to the macOS shape.
- Root-caused a ~10-day-old "the popup never appears with Claude Code" report to Claude Code's native webview panel not running lifecycle hooks at all (see the hook installer row above for the full evidence trail). `packages/companion/src-tauri/src/main.rs`'s `log_hook_debug` was added as a permanent diagnostic (writes to `<state root>/hook-debug.log`, since the show/hook processes are always spawned with stdout nulled and the existing `println!`s were never visible anywhere) and was what made the investigation tractable at all.

## Release blockers still open

1. The `artwait` publisher account is public, and it has version 0.2.4 of the pre-rename `artwait-vscode` extension already published. `artbreak` (this rename) has never been published under that same account and needs its own first upload. The publisher account is not authenticated in this environment, so the 0.2.7 Windows VSIX must be uploaded from the Publisher management page (or through an authenticated publishing credential). Decide separately whether to deprecate/unlist the old `artwait-vscode` listing once `artbreak` is live.
2. Privacy and support URLs remain to be chosen for the public listing.
3. `artbreak.exe` is not Authenticode-signed or timestamped. Marketplace packaging does not require it, but signing is a recommended Windows-release safeguard before broad distribution.
4. WebView2 prerequisite/error-path checks remain open.
5. Codex must trust the newly auto-installed `/hooks` entry once before it can run ArtBreak hooks. The immediate first-run artwork does not depend on this approval; the direct hook path was exercised successfully.
6. Product direction for 0.2.7 is to ship Windows and macOS Apple Silicon now with an ad-hoc signature (no `ARTBREAK_MACOS_SIGNING_IDENTITY` configured); macOS Intel (`darwin-x64`) is deferred until its CI runner becomes available. Ad-hoc signing means a first launch on macOS needs one manual Gatekeeper bypass (right-click → Open, or System Settings → Privacy & Security → "Open Anyway"). A Developer ID Application certificate + notarization, which would remove that friction, requires enrolling in the Apple Developer Program ($99/year) and is deferred; the pipeline already supports it (see `.github/workflows/build-vsix.yml`) whenever that's set up.
7. No automated extension-host, full hook-process, update-rollback, or native UI end-to-end suite exists yet. The current verification is a mix of unit tests and native Windows smoke tests.
8. Claude Code's default webview chat panel does not run lifecycle hooks (see the hook installer row above); ArtBreak only works with Claude Code sessions opened via "Claude Code: Open in Terminal" or an external terminal. Most users default to the webview panel, so this is a real first-run confusion risk until either Anthropic changes that behavior or ArtBreak adds an in-product nudge toward terminal mode (not yet built).

## Plan deviations approved by product direction

The implementation plan's initial minimal UI excluded source buttons and zoom.
Product decisions subsequently added a direct The Met link plus a magnifier and
keyboard/gesture zoom. These are intentional changes. The plan's request for
LLM-written descriptions was not implemented: the footer uses only catalog/API
fields, as required.

## Next release sequence

1. Download the `artbreak-win32-x64` and `artbreak-darwin-arm64` artifacts from
   [run 31762065364](https://github.com/nninnsungkim/ArtBreak/actions/runs/31762065364)
   and upload both as the win32-x64 and darwin-arm64 platform packages for
   `artbreak` 0.2.7 from the Publisher management page.
2. Verify a Marketplace fresh install against both Claude Code and Codex on
   Windows, and at least a Test Window launch on Apple Silicon (expect one
   Gatekeeper bypass on first launch, since the build is ad-hoc signed).
3. Re-run the `Build platform VSIX packages` workflow later to pick up
   `darwin-x64` once a `macos-13` runner is actually available, then upload it
   as a third platform package under the same 0.2.7 version.
4. Add public repository, privacy, and support URLs; decide whether to sign and
   timestamp the Windows executable, and whether to pursue Developer ID
   signing/notarization for macOS.
