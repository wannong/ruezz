# Changelog

All notable changes to WikiHome are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.6] - 2026-09-10

### Changed

- Desktop app icon is now the WikiHome robot-head mark

## [0.1.5] - 2026-09-10

### Added

- Remember the last vault path across restarts (`%APPDATA%\WikiHome\settings.json`)
- Title-bar menu: new vault, open vault, reveal in File Explorer
- File-tree “在资源管理器中显示” (notes live under the vault’s `wiki/` folder)

## [0.1.4] - 2026-09-10

### Added

- File tree context menu: copy, paste, rename, new note, and new folder (empty folders persist under `wiki/`)

### Changed

- Removed new-note buttons from the left sidebar header and the ribbon; use the file-tree context menu, Ctrl+N, or the command palette
- UI accent, links, and graph node colors are grayscale (black / white / gray)

## [0.1.3] - 2026-09-10

### Added

- Edit and create wiki Markdown pages (`vault_write_page` / `vault_create_page`), with autosave and live preview

## [0.1.2] - 2026-09-10

### Changed

- Right sidebar “反链” is now “图谱”: a one-hop graph of the current note (ribbon / Ctrl+G)
- Full-vault graph no longer opens as a center tab

### Added

- Agent message box height can be dragged and is remembered

## [0.1.1] - 2026-09-10

### Added

- Obsidian-style workspace: ribbon, file tree, tabs, markdown reading, command palette, search, backlinks, outline, and graph
- Theme-matched custom titlebar (drag, minimize, maximize, close)

### Fixed

- Sidecar no longer opens a visible Node.js console on Windows
- Sidecar process is stopped when the app window closes
- Light theme now applies to the center reading pane

### Changed

- Desktop window uses frameless chrome so the titlebar follows dark/light theme

## [0.1.0] - 2026-09-09

### Added

- Monorepo skeleton: Tauri desktop shell, engine-api facade, llmwiki-core adapter, agent, LLM client, Node sidecar
- Vault lifecycle: init, ingest file/text, list/read pages, lint, ask
- Chinese onboarding UI (vault path + OpenAI-compatible API settings)
- Web/dev mode via HTTP sidecar (`VITE_SIDECAR_HTTP`) when Tauri linker tools are unavailable
- Version sync check between desktop package.json and tauri.conf.json
- Vendored `llmwiki-core@0.1.0` behind replaceable adapter

### Changed

- Vendored Store uses JSON index instead of `better-sqlite3` (Windows-friendly, no node-gyp)

[Unreleased]: https://github.com/wikihome/wikihome/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/wikihome/wikihome/releases/tag/v0.1.6
[0.1.5]: https://github.com/wikihome/wikihome/releases/tag/v0.1.5
[0.1.4]: https://github.com/wikihome/wikihome/releases/tag/v0.1.4
[0.1.3]: https://github.com/wikihome/wikihome/releases/tag/v0.1.3
[0.1.2]: https://github.com/wikihome/wikihome/releases/tag/v0.1.2
[0.1.1]: https://github.com/wikihome/wikihome/releases/tag/v0.1.1
[0.1.0]: https://github.com/wikihome/wikihome/releases/tag/v0.1.0
