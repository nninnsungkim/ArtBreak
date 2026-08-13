# Changelog

## 0.2.7

- Fix garbled Codex status text in `ArtWait: Check Hook Status`.
- Fix `ArtWait: Test Window` bypassing the single-instance lock: it could
  open a second visible window while an agent-triggered window was already
  showing, or leave the lock held after closing and block a real
  agent-triggered window for up to 60 seconds. Test Window now shares the
  same lock as agent-triggered windows.
- Expand `ArtWait: Pause...` with 30 minutes, 1–8 hour presets, and a "Rest
  of today" option that ends at local midnight rather than a flat 24 hours
  later. `ArtWait: Show Status` now shows the exact time a fixed pause ends
  instead of just its mode.
- Remove duplicate/unused UI build artifacts (`app.js`, `app-v3.js`,
  `styles.css`, the unused `ui/paintings.json` copy) and the superseded
  Node hook handler, which the native companion binary replaced.
- Fix `packages/companion/tsconfig.json` pointing at a source directory that
  never contained TypeScript files.

## 0.2.6

- Revert an attempt to replace global `*` activation with `onStartupFinished`.
  That event does not re-fire for an extension installed or updated while VS
  Code is already running, so ArtWait would not write its VS Code lease or
  reinstall agent hooks until the next full restart — silently breaking
  work-start artwork until then. `*` costs a VS Code performance warning but
  is required for ArtWait to activate reliably right after install/update.

## 0.2.5

- Make Codex work-start hooks marker-only and let the active VS Code extension
  launch the gated artwork window. This keeps the hook inside Codex's short
  command budget while preserving the normal two-second display rule.
- Restrict both artwork collections to paintings. Rename the Met-curated
  `Highlights` collection to `Famous`; `Explore` now contains 5,000 paintings.

## 0.2.4

- Make Codex lifecycle hooks independent of stdin payload delivery. ArtWait now
  tracks the active Codex turn by its workspace, so the two-second artwork gate
  works with current Codex command-hook execution on Windows.

## 0.2.3

- Read Codex hook input as a JSON line instead of waiting for stdin to close.
  This prevents Codex from timing out the work-start hook before ArtWait can
  create its marker.

## 0.2.2

- Return valid neutral JSON from every Codex lifecycle hook. Codex now rejects
  empty command-hook output, which previously prevented ArtWait from receiving
  work-start events.

## 0.2.1

- Activate immediately in VS Code instead of waiting for the next startup
  lifecycle event, so a newly installed ArtWait can show its welcome work as
  soon as VS Code loads the extension.

## 0.2.0

- Add platform-specific VSIX packaging for Windows x64, macOS Intel, and
  macOS Apple Silicon.
- Ship the complete signed `ArtWait.app` Tauri bundle on macOS and install it
  atomically at `~/.artwait/app/ArtWait.app`.
- Add native macOS CI builds, linting, tests, and VSIX artifacts.

## 0.1.3

- Reduce Ctrl/Command wheel and trackpad zoom sensitivity to one third of the prior rate.

## 0.1.2

- Add Command-key zoom shortcuts on macOS.
- Add direct click-and-drag panning in the enlarged artwork view.

## 0.1.1

- Add stable `%LOCALAPPDATA%\\ArtWait\\app\\artwait.exe` companion installation and verified bundled manifests.
- Add The Met link, magnifier affordance, continuous Ctrl + wheel/trackpad zoom, Ctrl + Plus/Minus, and Ctrl-drag zoom.
- Upgrade the catalog to 10,000 named-artist public-domain Met works.
- Fix Windows hook UI launch and release the single-window lock when work ends.

## 0.1.0

- First public preview.
- VS Code extension with bundled platform-specific ArtWait companion.
- Claude Code lifecycle hook integration.
