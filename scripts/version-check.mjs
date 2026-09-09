import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8"));
const confPath = join(root, "apps/desktop/src-tauri/tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));

const pkgVer = pkg.version;
const tauriVer = conf.version;

if (pkgVer !== tauriVer) {
  console.error(`version mismatch: package.json=${pkgVer} tauri.conf.json=${tauriVer}`);
  process.exit(1);
}

console.log(`version:check ok (${pkgVer})`);
