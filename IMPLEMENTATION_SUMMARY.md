# ArtBreak implementation summary

For the authoritative current state, test evidence, and Marketplace release
gaps, see [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).

## Product implemented today

ArtBreak is a VS Code extension with a bundled Tauri companion. On activation,
it automatically installs its Claude Code and Codex hooks. The hook writes only
filesystem runtime state and returns neutral output. After two seconds of
active work, the companion displays a Met artwork window. It opens on Vincent
van Gogh's *Self-Portrait with a Straw Hat*, then continues through a shuffled
no-repeat deck of 10,000 works with named artists.

The UI includes responsive artwork fitting, title/artist/catalog facts, a The
Met link, arrow navigation, a lower-right magnifier, continuous Ctrl/Command
wheel/trackpad zoom (one third of the prior per-scroll sensitivity),
modifier-drag zoom, and direct click-and-drag panning. It does not use
generated artwork descriptions or an LLM.

The Windows companion is silently copied from the VSIX into the stable path
`%LOCALAPPDATA%\ArtBreak\app\artbreak.exe`; hook configuration targets that
stable path so a VS Code extension update does not invalidate it.

## Current artifact

- `packages/vscode-extension/artbreak-vscode-win32-x64-0.1.7.vsix`
- Windows x64 only
- Current VSIX SHA-256: `ece134a28bae5cd0529f3828c654a739b1e19c4e6d09a41e2803327e0b58fb94`
- Includes a monochrome pixel-art frame-and-magnifier Marketplace icon.

Version 0.1.4 is published as `artbreak.artbreak-vscode`; the locally built
0.1.7 automatic-hook, listing-copy, and featured-work update awaits upload
from the publisher account. Signing, clean-profile validation, and final real
Codex acceptance testing remain recommended release work.
