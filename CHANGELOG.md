# Changelog

All notable changes to WikiHome are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.10] - 2026-09-14

### Changed

- Model refresh now replaces the provider's remote model catalog instead of retaining stale entries.
- Tag filtering is consolidated into the compact search controls instead of occupying the file tree.
- Graph labels are centered below nodes and hovered nodes receive a subtle scale emphasis.

### Fixed

- KaTeX display formulas receive independent line spacing and overflow handling.
- PDF preview renders at the device pixel ratio for sharper text on high-DPI displays.

## [1.0.9] - 2026-09-14

### Added

- Editable, filterable page tags with full file-list hover metadata.
- In-app PDF and DOCX source previews.
- KaTeX rendering for Markdown and clickable blue links in Agent replies.

### Changed

- Increased graph node spacing and accounted for labels during layout.

### Fixed

- External Markdown links no longer get mistaken for internal pages.
- Source preview reads only approved PDF/DOCX files under `raw/sources`.

## [1.0.8] - 2026-09-13

### Added

- Explicit Agent file attachments with a compact attachment panel and related-session/file navigation.
- Automatic Agent internalization workflow after importing documents.
- Up to three independently maintained Agent conversation tabs.

### Changed

- Graph preview labels now scale with graph zoom.
- Markdown image references resolve relative to the current page and load local vault assets in the desktop app.

### Fixed

- Agent tab order no longer changes when a background session receives an update.
- Imported-document internalization now exposes its progress and attached source pages to the Agent.

## [1.0.7] - 2026-09-12

### Changed

- PDF ingest and Agent `convert_to_markdown` now use the pdf2md-layout converter (`pymupdf4llm` + glyph repair + figure/formula crops). Office/HTML still use MarkItDown. Figures and equations land beside the Markdown as `{stem}_assets/`.

### Fixed

- PDF / Office import looks for WikiHome's bundled Python and retries if the first interpreter is missing MarkItDown, instead of failing with “未安装 Python 包”

## [1.0.6] - 2026-09-11

### Added

- Self-contained Windows NSIS installer with bundled Node sidecar and Python/MarkItDown. Uses the PC's WebView2 when present; downloads a user-local runtime only if missing.

### Changed

- File import archives the original and writes one `wiki/sources` page. A complete Markdown file is no longer LLM-split into concept fragments. PDF / Word / PPT / Excel are converted with MarkItDown first.

### Fixed

- Graph layout keeps extra space between high-degree nodes so large disks no longer sit on top of each other
- GNU `WebView2Loader.dll` is copied next to WikiHome.exe at install time (it was previously only under `resources\`)
- Sidecar spawn surfaces stderr when the engine exits immediately; Node `\\?\` paths and inherited `NODE_OPTIONS` are sanitized

## [1.0.5] - 2026-09-11

### Added

- WikiHome Agent skills: grill-me / grilling interviews, and MarkItDown conversion of PDF/Office files before ingest

## [1.0.4] - 2026-09-11

### Added

- One-shot hover motion on ribbon, Agent, sidebar, theme, and tab-close icon buttons

### Changed

- Settings gear and session-history hand ease back to rest when the pointer leaves

## [1.0.3] - 2026-09-11

### Fixed

- Hop-scope graph zoom stays inside the sidebar instead of filling the window
- Dragging a graph node still pushes and follows nearby nodes, and far nodes stay on a leash so they are not lost off-screen

## [1.0.2] - 2026-09-11

### Fixed

- Route Claude models through Anthropic Messages so Agent tool calls no longer 502 on OpenAI-compatible gateways such as foxnio

## [1.0.1] - 2026-09-11

Desktop motion for overlays and Agent feedback, without slowing daily navigation.

### Added

- Enter/exit motion on dialogs, command palette, overlay sidebars, menus, toasts, stream cursor, and the thinking state

### Changed

- Note switching, file tree, and chat history stay instant
- Overlay exits use dedicated ease-in keyframes instead of reversing the enter animation

## [1.0.0] - 2026-09-10

WikiHome’s first feature-complete release: local wiki, graph, and a vertical Agent chat.

### Added

- Render Agent replies as Markdown (headings, lists, emphasis, code, tables, and `[[wikilinks]]`)

### Changed

- Waiting copy before the first token is now “思考中”

## [0.1.10] - 2026-09-10

### Added

- Vertical Agent chat: session history, model picker, context token usage, and send/stop
- Empty chats greet with the WikiHome mark and italic “Hi there!”

### Changed

- New conversation sits next to the session-history button
- Agent composer height can be dragged from the input panel again

## [0.1.9] - 2026-09-10

### Fixed

- After collapsing the right sidebar, the expand control stays on the far right of the note header

## [0.1.8] - 2026-09-10

### Fixed

- Collapsing the Agent pane no longer leaves it without a way to open it again (ribbon Agent button and a close control on the right sidebar)

## [0.1.7] - 2026-09-10

### Changed

- Keep read/edit mode controls in the same top-right position
- Align file, tab, and Agent pane header heights, and match Agent tab type to the file header

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

[Unreleased]: https://github.com/wikihome/wikihome/compare/v1.0.10...HEAD
[1.0.10]: https://github.com/wikihome/wikihome/releases/tag/v1.0.10
[1.0.9]: https://github.com/wikihome/wikihome/releases/tag/v1.0.9
[1.0.8]: https://github.com/wikihome/wikihome/releases/tag/v1.0.8
[1.0.7]: https://github.com/wikihome/wikihome/releases/tag/v1.0.7
[1.0.6]: https://github.com/wikihome/wikihome/releases/tag/v1.0.6
[1.0.5]: https://github.com/wikihome/wikihome/releases/tag/v1.0.5
[1.0.4]: https://github.com/wikihome/wikihome/releases/tag/v1.0.4
[1.0.3]: https://github.com/wikihome/wikihome/releases/tag/v1.0.3
[1.0.2]: https://github.com/wikihome/wikihome/releases/tag/v1.0.2
[1.0.1]: https://github.com/wikihome/wikihome/releases/tag/v1.0.1
[1.0.0]: https://github.com/wikihome/wikihome/releases/tag/v1.0.0
[0.1.10]: https://github.com/wikihome/wikihome/releases/tag/v0.1.10
[0.1.9]: https://github.com/wikihome/wikihome/releases/tag/v0.1.9
[0.1.8]: https://github.com/wikihome/wikihome/releases/tag/v0.1.8
[0.1.7]: https://github.com/wikihome/wikihome/releases/tag/v0.1.7
[0.1.6]: https://github.com/wikihome/wikihome/releases/tag/v0.1.6
[0.1.5]: https://github.com/wikihome/wikihome/releases/tag/v0.1.5
[0.1.4]: https://github.com/wikihome/wikihome/releases/tag/v0.1.4
[0.1.3]: https://github.com/wikihome/wikihome/releases/tag/v0.1.3
[0.1.2]: https://github.com/wikihome/wikihome/releases/tag/v0.1.2
[0.1.1]: https://github.com/wikihome/wikihome/releases/tag/v0.1.1
[0.1.0]: https://github.com/wikihome/wikihome/releases/tag/v0.1.0
