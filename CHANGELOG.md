# Changelog

All notable changes to WikiHome are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Desktop UI: three-pane workspace (file tree / content / agent chat) with full-window layout
- Sidecar discovery for local release exe; WebView2Loader helper script for GNU builds

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

[Unreleased]: https://github.com/wikihome/wikihome/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wikihome/wikihome/releases/tag/v0.1.0
