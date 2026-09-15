# Centaur architecture

```
GUI (React) → Tauri commands → Node sidecar (JSON-RPC)
                                 ├─ agent (ask)
                                 ├─ engine-api (contract)
                                 └─ engine-llmwiki → vendor/llmwiki-core
                                      └─ llm (OpenAI-compatible)
```

Replace the engine later by implementing `@wikihome/engine-api` in a new package and swapping the sidecar wiring. GUI and Tauri command names stay stable.

## Vault layout (from llmwiki-core)

- `raw/sources/` — immutable originals (Markdown, PDF, Word, …)
- `wiki/` — wiki pages you browse (always Markdown)
- `.llmwiki/` — derived JSON index (rebuildable)
- `.wikihome/meta.json` — Centaur vault metadata (`format: 1`)

## Import vs 内化

**Import** (GUI 导入 / `ingest_file` / `ingest_text`) archives the original and files **one** `wiki/sources/` page. A complete Markdown file is not split by heading. PDF / Word / PPT / Excel are converted with MarkItDown into that single page.

**内化 / compile** is a later Agent step: update existing concept pages when the user asks. It is not a side effect of import.
