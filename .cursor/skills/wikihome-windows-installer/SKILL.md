---
name: wikihome-windows-installer
description: >-
  Builds Centaur's self-contained Windows NSIS installer (setup.exe) for
  machines with no Node, Python, Git, or toolchain. Use when the user asks to
  打包, 打安装包, 正式安装包, NSIS, setup.exe, 给小白打包, ship a Windows installer,
   or release a Centaur NSIS installer for a blank PC.
---

# Centaur Windows installer

Self-contained **current-user** NSIS setup for a PC with nothing installed. Bundles Node sidecar and embeddable CPython + MarkItDown. Uses the machine's WebView2 when present; GNU builds still need `WebView2Loader.dll` **next to the exe** (NSIS post-install copies it from `resources\`).

Deliverable: `release/Centaur_<version>_x64-setup.exe` (typically ~150MB). Do not commit `release/`, `.cache/`, or staged runtimes.

## Preconditions

- Repo root is `D:\WikiHome` (or the current WikiHome checkout).
- Active Rust: `stable-x86_64-pc-windows-gnu`. Do not use MSVC (`cl.exe` / missing manifest).
- Put MinGW on PATH before every Tauri release build:

```powershell
$env:PATH = "D:\winlibs\mingw64\bin;" + $env:PATH
```

Confirm `windres.exe` exists. PowerShell 5.1: use `;`, never `&&`.

- Stop Centaur **dev** processes first (`pnpm --filter @wikihome/desktop dev`, vite, sidecar http). They lock `node_modules` binaries and make `pnpm install` / deploy fail with EPERM.
- Do not bump versions or commit unless the user asked. If they want a new version, follow `docs/VERSIONING.md` and `pnpm version:check`.

## Workflow

Copy this checklist and complete it in order:

```
- [ ] Stop desktop/vite/sidecar-http
- [ ] MinGW on PATH; rustc gnu
- [ ] Stage runtime (force if code changed)
- [ ] Smoke sidecar + bundled Python
- [ ] tauri build
- [ ] Copy pack to release/
- [ ] Tell user the setup.exe path and 小白 steps
```

### 1. Stage runtime

If `apps/desktop/src-tauri/resources/sidecar/dist/cli.js` already exists, `scripts/before-tauri-build.ps1` **skips** staging. After sidecar/agent/Python/skill changes, restage:

```powershell
# force sidecar+python rebuild when JS/Python/skills changed
Remove-Item -Recurse -Force .cache\installer-runtime\sidecar-pkg -ErrorAction SilentlyContinue
node scripts/rm-tree.mjs apps/desktop/src-tauri/resources/sidecar
pnpm release:stage
```

Or: `powershell -ExecutionPolicy Bypass -File scripts/stage-installer-runtime.ps1 -Force`

This script:

1. Builds `packages/*`
2. `pnpm --filter @wikihome/sidecar deploy --prod --ignore-scripts --node-linker=hoisted` into `.cache/installer-runtime/sidecar-pkg` (not directly into `resources/`)
3. `robocopy /E` (not `/MIR`) cache → `apps/desktop/src-tauri/resources/sidecar`
4. Materializes any leftover reparse points (`scripts/materialize-node-modules.mjs`)
5. Copies `node.exe` (from `node -p process.execPath`), WebView2Loader.dll, embeddable CPython 3.14 + `markitdown[docx,pptx,xlsx]` + `pymupdf4llm>=1.28` with `PYTHONNOUSERSITE=1` and `pip install --no-user`

### 2. Smoke

```powershell
$node = "apps\desktop\src-tauri\resources\runtime\node.exe"
$cli  = "apps\desktop\src-tauri\resources\sidecar\dist\cli.js"
# boot JSON on stdout: {"id":"boot","result":{"ok":true,...}}
# kill after ~3s

$env:PYTHONNOUSERSITE = "1"
apps\desktop\src-tauri\resources\runtime\python\python.exe -c "import markitdown, pymupdf4llm; print(markitdown.__file__); print(pymupdf4llm.__file__)"
# must be under resources\runtime\python\Lib\site-packages, NEVER AppData\Roaming
```

Also confirm `resources\sidecar\node_modules\@wikihome\agent\skills\grill-me\SKILL.md` exists.

### 3. Build NSIS

```powershell
$env:PATH = "D:\winlibs\mingw64\bin;" + $env:PATH
pnpm --filter @wikihome/desktop tauri build
```

Expect: compile, pack sidecar, then `makensis`. Success log: `Finished 1 bundle at: ...\bundle\nsis\Centaur_*_x64-setup.exe`.

A **~4MB** setup.exe is the old shell-only pack. A real 小白 installer is **tens to ~150MB** (sidecar + Python; WebView2 is *not* embedded). If it is ~4MB, resources were not packed — restage and rebuild. If it is ~300MB, the old Fixed Runtime is still being packed — `webviewInstallMode` must be `skip`.

### 4. Copy to `release/`

```powershell
pnpm release:pack
```

`release:pack` copies only the setup.exe whose name matches `tauri.conf.json` `version`, not the alphabetically first `*setup.exe` (an old stub would otherwise win).

Write/copy `release/安装说明.txt` (UTF-8) from `scripts/install-readme.zh-CN.txt`. PowerShell 5.1 `.ps1` files cannot hold Chinese string literals without a BOM.

Remove leftover older `Centaur_*_x64-setup.exe` in `release/` so 小白 only sees the current version.

### 5. Hand off

Give the user **one file**: `release/Centaur_<ver>_x64-setup.exe`.

小白 steps:

1. Copy the setup.exe to that PC
2. Double-click; Chinese; Next
3. No admin, no Node/Python/Git
4. First launch: pick a vault folder, then fill AI base URL + key in settings
5. Needs 64-bit Windows 10/11. If the PC already has Edge/WebView2, that is used. If not, first launch downloads a user-local copy (no admin).

Do not give users a standalone exe from `release/`; deliver the NSIS installer.

## Hard rules (do not improvise)

- **Never** `robocopy /MIR` (or any follow-junction delete) on `resources/sidecar`. pnpm junctions can point at `packages/` and `vendor/`; mirroring empty onto them **wipes the monorepo**. Delete trees only with `node scripts/rm-tree.mjs`, which uses `lstat` and does not follow reparse points. That helper must only run under `apps/desktop/src-tauri/resources` or `.cache/installer-runtime`.
- **Never** `pnpm deploy` straight into `resources/sidecar`. On this machine the final rename `sidecar_tmp_*` → `sidecar` hits EPERM. Deploy to `.cache/installer-runtime/sidecar-pkg`, then `robocopy /E`.
- Isolated (non-hoisted) deploy + following junctions explodes size (50MB → 600MB+) and is unsafe. Keep `--node-linker=hoisted`.
- Bundled pip must not see the developer user-site. Always `PYTHONNOUSERSITE=1` and `pip install --no-user`. Verify `markitdown.__file__` is inside the embed tree.
- GNU builds need `WebView2Loader.dll` beside the exe. `build.rs` copies it from `resources/` into `target/release/`. NSIS `windows/installer-hooks.nsh` copies `$INSTDIR\resources\WebView2Loader.dll` → `$INSTDIR\` after install.
- Do **not** pack WebView2 Fixed Runtime by default (`webviewInstallMode: skip`). Prefer the OS WebView2 (look for `msedgewebview2.exe`, not a leftover registry `pv`). If missing, the app downloads a user-local runtime into `%LOCALAPPDATA%\WikiHome\webview2-runtime` (no admin).
- Sidecar spawn looks for `runtime/node.exe` + `sidecar/dist/cli.js` under resource dir, exe dir, or a short walk (skips `webview2-runtime` / `node_modules`). Sets `WIKIHOME_PYTHON`, `PYTHONNOUSERSITE`, `NODE_USE_ENV_PROXY`, `NODE_PATH`. Strips `\\?\` prefixes. Stderr goes to `%APPDATA%\WikiHome\sidecar-stderr.log`.
- `beforeBuildCommand` is a **single** `-File scripts/before-tauri-build.ps1`. `cmd /C` does not treat `;` as a command separator.
- Do not git-add: `release/`, `.cache/`, `apps/desktop/src-tauri/resources/runtime/`, `resources/sidecar/`, `WebView2Loader.dll`, `webview2-runtime/`, `*.exe`.
- After a botched stage that deleted `packages/` or `vendor/`: `git checkout -- packages vendor` then `pnpm install --force` (dev servers must be stopped).

## Config that must stay true

`apps/desktop/src-tauri/tauri.conf.json`:

- `bundle.targets`: `["nsis"]`
- `bundle.resources`: `resources/runtime/**/*`, `resources/sidecar/**/*`, `resources/WebView2Loader.dll`
- `webviewInstallMode`: `{ "type": "skip" }`
- `nsis.installerHooks`: `./windows/installer-hooks.nsh` (copies loader DLL next to the exe)
- `nsis.languages`: `SimpChinese`, `English`; `installMode`: `currentUser`

Root scripts: `release:stage`, `release:pack`, `release:prepare` (DLL only).
