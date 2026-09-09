# Origin

| Field | Value |
| --- | --- |
| Package | `llmwiki-core` |
| Version | `0.1.0` |
| License | MIT |
| Upstream npm | https://www.npmjs.com/package/llmwiki-core |
| Upstream repo (declared) | https://github.com/Edisonzszs/llmwiki (may be unavailable) |
| Vendored from | npm pack tarball `llmwiki-core-0.1.0.tgz` |
| Vendored date | 2026-09-09 |
| Contents | Published `dist/` + `package.json` + `LICENSE` (no upstream TypeScript sources in tarball) |

## WikiHome patches

| File | Change |
| --- | --- |
| `dist/store.js` | Replaced `better-sqlite3` with JSON-file Store (same class API) so Windows installs without node-gyp |
| `package.json` | Dropped `better-sqlite3` dependency |

Upgrade process: replace this directory from a new npm pack, re-apply patches if needed, update this file, adjust `@wikihome/engine-llmwiki`.
