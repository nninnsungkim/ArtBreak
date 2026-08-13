# ArtWait implementation status

Last audited: 2026-08-12 (Windows `win32-x64`; macOS packaging implementation)

## Current release target

The current target is one platform-specific VS Code Marketplace release: Windows
x64, macOS Intel, and macOS Apple Silicon. It silently installs the companion
under the user's profile, automatically installs Claude Code and Codex hooks on
activation, and opens a welcome artwork without depending on an agent hook. No
API key, server, LLM, or separate installer is required.

## Implemented and verified

| Area | Status | Evidence |
| --- | --- | --- |
| Runtime state, leases, markers, pause and dismissal | Implemented | Extension unit suite passes. |
| Claude Code and Codex hook installer | Implemented | Both integrations are registered automatically at extension activation. Selective merge, changed-only backup, removal, and neutral output are implemented. Claude lifecycle was exercised against a real local session previously; current hook smoke test passed. |
| Tauri companion | Implemented | Rust CLI supports `hook`, `show`, and `control`; `cargo test` passes (4 tests). |
| Two-second gate and single visible window | Implemented | Hook smoke used a fresh VS Code lease and created a UI only after the gate. `ui.lock` protects the window and is now removed before automatic exit. `Test Window` previously bypassed this lock entirely (could open a second window, or leave the lock held after closing); it now acquires and releases the same lock as agent-triggered windows. |
| Artwork catalog and navigation | Implemented | The bundled catalog contains 5,000 displayable Met paintings and zero `Unknown` artists. It starts at random in 227 official Met `Famous` paintings, with an in-window Explore control for the full painting catalog. Both collections use shuffled deck/history navigation. |
| Artwork UI | Implemented | Responsive image fit, work/artist/source fields, Famous/Explore controls, The Met link, previous/next navigation, magnifier affordance, continuous pointer-anchored Ctrl/Command zoom, modifier-drag zoom, and direct click-and-drag panning. Wheel/trackpad zoom sensitivity is one third of the previous setting. |
| Stable companion path and updates | Implemented for Windows and macOS | Windows uses `%LOCALAPPDATA%\ArtWait\app\artwait.exe`; macOS installs the complete `~/.artwait/app/ArtWait.app` bundle. Both verify the embedded executable hash before a staged, rollback-safe payload swap. |
| macOS packaging | Implemented; native CI pending | The package script builds a Tauri `ArtWait.app` bundle only on its native macOS host, signs/verifies it, embeds it in the matching VSIX, and preserves the full bundle when installing. When the configured GitHub Secrets are present, CI imports the Developer ID certificate, notarizes, and staples each bundle. The CI matrix covers `darwin-x64` and `darwin-arm64`. |
| First-run display | Implemented and acceptance-tested | The extension schedules one immediate welcome work on its first activation. It bypasses agent hooks but respects ArtWait pause state and the normal single-window lock. A clean VS Code profile opened the artwork window automatically. |
| Windows VSIX | Built and checked | `artwait-vscode-win32-x64-0.2.7.vsix`, 2,711,119 bytes, SHA-256 `8242525c093a9b8a19201302193ac17cdf2ead59d88e13efc79efe358979a87c`. Its manifest activates with `*`. Packaging also fixed a `.vscodeignore` gap that let a stale `tsc -p ./tsconfig.test.json` output tree (`out/src/**`) leak into earlier local packages; this archive has no such duplicate files (32 files, 2.59 MB unpacked, vs. 56 files before the fix). |

## Latest local verification

- `npm run test:run --workspace=artwait-vscode` — passed.
- `npm run lint --workspace=artwait-vscode` — passed.
- `npm run typecheck --workspace=artwait-vscode` — passed.
- `cargo test` — 4 passed.
- `npm run package:vsix --workspace=artwait-vscode` — passed.
- Stable-path Test Window rendered the magnifier in the artwork's lower right.
- Fresh Test Window accepted Ctrl + wheel/trackpad scroll and `Ctrl + Plus` to open the zoom view.
- Loaded image accepted Ctrl-drag and enlarged visibly.
- Isolated Claude hook smoke: start returned in under one second, marker and UI appeared after the two-second gate; stop returned in 40 ms and removed marker, UI process, and `ui.lock`.
- Version 0.1.4 passed typecheck, lint, extension tests, and all four Rust tests; its VSIX archive contains the declared PNG icon and an executable whose SHA-256 matches its embedded manifest.
- Version 0.1.4 was installed through the Microsoft VS Code CLI on this computer and published as `artwait.artwait-vscode`.
- Version 0.1.6 passed typecheck, lint, and the extension test suite, then packaged successfully with automatic Claude/Codex hook installation.
- Hook installation now targets `C:\Users\carlk\AppData\Local\ArtWait\app\artwait.exe` for both agents; repeated installation made no configuration writes or new backup files.
- A synthetic Codex start signal matching the current VS Code workspace opened the ArtWait window after the two-second gate; its paired stop signal was sent and the test-created window was closed.
- Version 0.1.8 passed typecheck, lint, extension tests, catalog tests, and all four Rust tests. Its installed native Test Window opens in Highlights with a random work; two independent window launches produced different opening works through Windows UI Automation.
- Version 0.1.9 passed typecheck, lint, the extension unit suite, and all four Rust tests. Its release companion opened a visible welcome window without a Claude/Codex hook or marker, held the normal `ui.lock`, and removed that lock when closed.
- Version 0.2.0's Windows-compatible implementation passed typecheck, lint, and the extension unit suite, including the macOS app-bundle layout contract. Native macOS build and UI validation run in the newly extended native CI matrix.
- Version 0.2.1 passed typecheck, lint, and the extension unit suite after changing activation to immediate. Its final VSIX then passed clean-profile and installed-while-running acceptance tests.
- The final 0.2.1 Windows VSIX archive has the expected `0.2.1` version, `win32-x64` target, immediate activation, and companion hash.
- Fresh-profile acceptance: installing 0.2.1 before launching VS Code automatically opened the ArtWait window and its companion from the isolated app path.
- Running-session acceptance: installing 0.2.1 into an already-open, otherwise empty VS Code profile also automatically opened the ArtWait window, with no reload or terminal action in that profile.
- Version 0.2.5 passed typecheck, lint, the extension unit suite, companion catalog tests, and all four Rust tests. Its clean-profile Codex run registered `UserPromptSubmit Completed` and `Stop Completed`; the extension installed the stable companion and hooks automatically. Codex work-start now writes its marker synchronously, while the active VS Code extension opens the gated window.
- Version 0.2.7 passed `tsc --noEmit` for both packages, the extension unit suite (including new `pauseUntilEndOfDay` tests), `cargo check`, and `cargo test` (4 passed). Its packaged VSIX was rebuilt after fixing a `.vscodeignore` gap and verified to contain no stale `out/src/**` duplicate files.

## Release blockers still open

1. The `artwait` publisher and version 0.2.4 are public. The publisher account is not authenticated in this environment, so the 0.2.7 Windows VSIX must be uploaded from the Publisher management page (or through an authenticated publishing credential).
2. Privacy and support URLs remain to be chosen for the public listing.
3. `artwait.exe` is not Authenticode-signed or timestamped. Marketplace packaging does not require it, but signing is a recommended Windows-release safeguard before broad distribution.
4. WebView2 prerequisite/error-path checks remain open.
5. Codex must trust the newly auto-installed `/hooks` entry once before it can run ArtWait hooks. The immediate first-run artwork does not depend on this approval; the direct hook path was exercised successfully.
6. The macOS pipeline currently uses an ad-hoc signature if no `ARTWAIT_MACOS_SIGNING_IDENTITY` is provided. Before a public release, supply a Developer ID Application certificate, notarize both Mac app bundles, and perform a clean-machine launch on Intel and Apple Silicon. Apple requires signing and notarization to avoid Gatekeeper friction for direct macOS distribution.
7. No automated extension-host, full hook-process, update-rollback, or native UI end-to-end suite exists yet. The current verification is a mix of unit tests and native Windows smoke tests.

## Plan deviations approved by product direction

The implementation plan's initial minimal UI excluded source buttons and zoom.
Product decisions subsequently added a direct The Met link plus a magnifier and
keyboard/gesture zoom. These are intentional changes. The plan's request for
LLM-written descriptions was not implemented: the footer uses only catalog/API
fields, as required.

## Next release sequence

1. Upload the verified `win32-x64` 0.2.7 VSIX, then verify a Marketplace fresh install against both Claude Code and Codex.
2. Run the `Build platform VSIX packages` workflow and retrieve `darwin-x64` and `darwin-arm64` artifacts for 0.2.7.
3. Sign/notarize both macOS bundles with the Developer ID release credential, then upload the two macOS platform packages under version 0.2.7.
4. Add public repository, privacy, and support URLs; decide whether to sign and timestamp the Windows executable.
5. Perform clean-profile VS Code, real Claude, and real Codex acceptance tests on Windows and macOS.
