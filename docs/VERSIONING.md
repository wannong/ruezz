# Versioning

## Package versions

| Package | Semver meaning |
| --- | --- |
| `@wikihome/engine-api` | **Public contract**. Breaking type/method changes → major. |
| `@wikihome/engine-llmwiki` | Adapter to vendored core. Bugfixes → patch; behavior mapped to api → follow api. |
| `@wikihome/llm` | Provider client. New providers → minor. |
| `@wikihome/agent` | Ask/tool loop. Prompt-only tweaks → patch. |
| `@wikihome/sidecar` | JSON-RPC process. Wire protocol breaks → major. |
| `@wikihome/desktop` | App UX. Must match Tauri `version` in `tauri.conf.json`. |

Root app and all packages ship together as **WikiHome `vX.Y.Z`** (git tag).

## Vault on-disk format

Vaults write `format: 1` in `.wikihome/meta.json`. Engine upgrades that cannot read an older format must ship a migrator and bump this number.

## Release checklist

1. Update `CHANGELOG.md` (`Unreleased` → dated section).
2. Bump versions in workspace packages + `apps/desktop/package.json` + `tauri.conf.json`.
3. Run `pnpm version:check`.
4. Commit with conventional message, tag `vX.Y.Z`.

## Vendor upgrades

Upgrading `vendor/llmwiki-core` is a dedicated change: update `ORIGIN.md`, adapt `engine-llmwiki`, add CHANGELOG note. Do not mix with unrelated UI work.
