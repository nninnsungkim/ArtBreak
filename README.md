# ArtBreak

> A quiet art break while Claude Code or Codex works.

ArtBreak is a VS Code extension that gives you something worth looking at while
your agent works. It needs no account, API key, local server, or separate
installer.

## Install

1. Install ArtBreak from the VS Code Marketplace (or install the supplied VSIX).
2. **Claude Code — nothing else to do.** ArtBreak opens a welcome artwork
   immediately and installs its Claude Code hook automatically. Every later
   Claude Code turn shows artwork after two seconds of active work.
3. **Codex — one manual step.** ArtBreak installs its Codex hook automatically
   too, but Codex requires you to approve it once: run `/hooks` in Codex and
   trust the ArtBreak entry. Until you do, Codex turns will not show artwork
   (the welcome artwork and Claude Code integration are unaffected).

## Current support

ArtBreak ships platform-specific VSIX packages for local VS Code:

- Windows x64: the companion installs to
  `%LOCALAPPDATA%\ArtBreak\app\artbreak.exe`.
- macOS Apple Silicon and Intel: the signed Tauri app bundle installs to
  `~/.artbreak/app/ArtBreak.app`.

VS Code selects the matching Marketplace package automatically. Linux and
remote workspaces (SSH, WSL, Codespaces) are not supported; ArtBreak stays
inactive there because the artwork window must open on the local desktop.

## How it works

The welcome work opens immediately on first install. After that, once an
agent turn has been active for two seconds, ArtBreak opens at random in
**Famous**, a selection of popular and important paintings designated by The
Met; switch to **Explore** for the full 5,000-painting collection.

## Artwork controls

- Use the left/right arrow buttons or keyboard arrows to navigate the shuffled
  no-repeat deck.
- Select the lower-right magnifier, use Ctrl (⌘ on Mac) + wheel/trackpad
  scroll, press Ctrl/⌘ + Plus/Minus, or hold Ctrl/⌘ and drag vertically to
  enlarge or reduce the current work. Zoom stays centered on the detail under
  the pointer; drag normally or use scrolling to move around the work.
- Press Escape in the zoom view to return to the artwork; press Escape in the
  main view to dismiss ArtBreak for the current idle cycle.
- Select **View at The Met** to open the collection page in the default browser.

Famous and Explore are both shuffled and avoid immediate repeats. ArtBreak
shows collection facts from the source; it does not generate artwork commentary
with an LLM.

## Commands

- `ArtBreak: Pause...` — pause for a chosen duration, current leases, or indefinitely.
- `ArtBreak: Resume` — resume normal behavior.
- `ArtBreak: Test Window` — open the artwork window without an agent task.
- `ArtBreak: Show Status` — show pause, marker, and lease status.
- `ArtBreak: Reset Runtime State` — remove stale runtime state.
- `ArtBreak: Install Agent Hooks` — repair or refresh one agent integration.
- `ArtBreak: Remove Agent Hooks` — selectively remove ArtBreak hooks.
- `ArtBreak: Check Hook Status` — check which hooks are installed.

## Development and packaging

```powershell
npm run typecheck --workspace=artbreak-vscode
npm run lint --workspace=artbreak-vscode
npm run test:run --workspace=artbreak-vscode
cd packages/companion/src-tauri; cargo test
npm run package:vsix --workspace=artbreak-vscode
```

The packaging command creates the native release payload, produces an
integrity manifest, embeds both into the VSIX, and writes the artifact to
`packages/vscode-extension/`. Windows builds produce an `.exe`; macOS builds
produce a signed `ArtBreak.app` bundle. The GitHub Actions workflow builds the
three matching VSIX packages on native Windows x64, macOS Intel, and macOS
Apple Silicon runners.

For the public Mac release, configure these GitHub Actions secrets once:
`ARTBREAK_MACOS_CERTIFICATE_BASE64`, `ARTBREAK_MACOS_CERTIFICATE_PASSWORD`,
`ARTBREAK_MACOS_KEYCHAIN_PASSWORD`, `ARTBREAK_MACOS_SIGNING_IDENTITY`,
`ARTBREAK_APPLE_ID`, `ARTBREAK_APPLE_APP_PASSWORD`, and
`ARTBREAK_APPLE_TEAM_ID`. The workflow then imports the Developer ID certificate,
signs the embedded app, notarizes it, and staples the approval before VSIX
packaging. Without these secrets, CI produces an ad-hoc-signed test artifact,
not a public-release Mac package.

## Release status

ArtBreak is a rename of the previously published ArtWait extension. The old
listing (publisher `artwait`, extension `artwait-vscode`) remains published
at version 0.2.4 under its old name; ArtBreak (`artwait.artbreak-vscode`,
same publisher account) has not been published yet. Version 0.2.7 is its
first upload candidate: it carries the rename plus fixes to the Codex
work-start path, a reliable-activation regression, and the Test Window
single-instance lock, and adds native macOS Intel and Apple Silicon packages
alongside Windows x64. It awaits the native CI builds and upload from the
publisher account. A Developer ID signature and notarization are still
required for a frictionless public macOS release. See
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for the full audit.

## License

[MIT](./LICENSE)
