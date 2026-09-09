# WikiHome architecture

```
GUI (React) → Tauri commands → Node sidecar (JSON-RPC)
                                 ├─ agent (ask)
                                 ├─ engine-api (contract)
                                 └─ engine-llmwiki → vendor/llmwiki-core
                                      └─ llm (OpenAI-compatible)
```

Replace the engine later by implementing `@wikihome/engine-api` in a new package and swapping the sidecar wiring. GUI and Tauri command names stay stable.

## Vault layout (from llmwiki-core)

- `raw/sources/` — immutable sources
- `wiki/` — compiled pages (entities, concepts, …)
- `.llmwiki/` — derived SQLite index (rebuildable)
- `.wikihome/meta.json` — WikiHome metadata (`format: 1`)
