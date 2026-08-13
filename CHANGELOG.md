# Changelog

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
