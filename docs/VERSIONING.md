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

Root app and all packages ship together as **Ruezz `vX.Y.Z`** (git tag).

## Vault on-disk format

Vaults write `format: 1` in `.wikihome/meta.json`. Engine upgrades that cannot read an older format must ship a migrator and bump this number.

## Release checklist

1. Update `CHANGELOG.md` (`Unreleased` → dated section).
2. Bump versions in workspace packages + `apps/desktop/package.json` + `tauri.conf.json`.
3. Run `pnpm version:check`.
4. Commit with conventional message, tag `vX.Y.Z`.
5. For Windows updater artifacts, set signing env before `tauri build`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "D:\WikiHome\.cache\signing\ruezz.key"
# private key lives only under .cache/signing/ (gitignored)
```

Upload `Ruezz_<ver>_x64-setup.exe`, its `.sig`, and `latest.json` to the **wannong/ruezz** GitHub Release. Endpoint used by the app:

`https://github.com/wannong/ruezz/releases/latest/download/latest.json`

## Vendor upgrades

Upgrading `vendor/llmwiki-core` is a dedicated change: update `ORIGIN.md`, adapt `engine-llmwiki`, add CHANGELOG note. Do not mix with unrelated UI work.
