# Microsoft Store (MSIX) packaging

This branch prepares Ruezz for the Microsoft Store via **MSIX** (Microsoft re-signs Store packages — no paid Authenticode cert required for Store submission).

## Partner Center privacy URL

Use either:

- https://github.com/wannong/ruezz/blob/store/msix/PRIVACY.md
- https://raw.githubusercontent.com/wannong/ruezz/store/msix/PRIVACY.md

(After merge to `main`, prefer the `main` blob/raw URLs.)

## Prerequisites

- Windows 10/11 x64
- [WinApp CLI](https://github.com/microsoft/WinAppCli): `winget install Microsoft.WinAppCli`
- Existing Ruezz Tauri toolchain (Node 20+, pnpm, MinGW GNU Rust target as in the Windows installer skill)
- Staged installer runtime (`pnpm release:stage`) so `resources/runtime` + `resources/sidecar` exist

## Identity (must match Partner Center)

`store/msix/Package.appxmanifest` is already filled from Partner Center:

| Field | Value |
|---|---|
| Name | `nong.Ruezz` |
| Publisher | `CN=A9453A2B-53CD-4F9F-8509-8A51777F01E8` |
| PublisherDisplayName | `晓nong` |
| Version | `1.2.3.0` (bump four-part version on every Store upload) |

If Partner Center identity ever changes, update the manifest to match exactly.

## Store vs GitHub builds

| | GitHub NSIS | Store MSIX |
|---|---|---|
| Config | `tauri.conf.json` | + `tauri.microsoftstore.conf.json` |
| WebView2 | `skip` (prefer OS) | `offlineInstaller` |
| Updater artifacts | yes | no |
| In-app GitHub update | yes | disabled (`VITE_RUEZZ_CHANNEL=store`) |
| Code signing for Store | N/A (not used) | Microsoft re-signs MSIX |

## Build MSIX (local test)

```powershell
$env:PATH = "D:\winlibs\mingw64\bin;" + $env:PATH
pnpm release:stage   # if resources missing
powershell -ExecutionPolicy Bypass -File scripts/pack-msix.ps1
```

The script:

1. Builds Tauri with the Microsoft Store config merge (`--no-bundle` then stages files)
2. Copies `Ruezz.exe` + `resources/` into `.cache/msix-layout/`
3. Copies `store/msix/Package.appxmanifest` + `Assets/`
4. Runs `winapp pack` (dev cert for local sideload only)

For **Store upload**, prefer an **unsigned** or Store-ready package per current Partner Center / `winapp store` guidance — Microsoft re-signs after certification. Do not rely on the local `devcert.pfx` for submission.

## Assets

Placeholder PNGs live under `store/msix/Assets/`. Replace with final Store artwork before submission (or regenerate with `winapp init` / design exports).

## Checklist before first submission

- [ ] Privacy URL filled in Partner Center
- [ ] Manifest Name/Publisher match Product identity
- [ ] Age ratings questionnaire completed
- [ ] Store listing screenshots + description (zh-CN / en-US)
- [ ] MSIX installs on a clean Windows 10/11 VM; vault + LLM settings work
- [ ] Sidecar / Python conversion works under package identity
- [ ] Confirm GitHub updater UI is hidden on Store channel
