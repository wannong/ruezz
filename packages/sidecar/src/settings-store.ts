import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { VaultSettingsSchema, type VaultSettings } from "@wikihome/engine-api";

export function configDir(): string {
  if (process.env.WIKIHOME_CONFIG_DIR) return process.env.WIKIHOME_CONFIG_DIR;
  if (process.env.APPDATA) return path.join(process.env.APPDATA, "WikiHome");
  return path.join(os.homedir(), ".wikihome");
}

export function settingsFromEnv(): Partial<VaultSettings> {
  const out: Partial<VaultSettings> = {};
  if (process.env.WIKIHOME_VAULT) out.vaultPath = process.env.WIKIHOME_VAULT;
  if (process.env.WIKIHOME_API_BASE) out.apiBaseUrl = process.env.WIKIHOME_API_BASE;
  if (process.env.WIKIHOME_API_KEY) out.apiKey = process.env.WIKIHOME_API_KEY;
  if (process.env.WIKIHOME_MODEL) out.model = process.env.WIKIHOME_MODEL;
  if (process.env.WIKIHOME_MOCK === "1") out.mock = true;
  if (process.env.WIKIHOME_MOCK === "0") out.mock = false;
  return out;
}

export function loadPersistedSettings(): Partial<VaultSettings> {
  try {
    const file = path.join(configDir(), "settings.json");
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return VaultSettingsSchema.partial().parse(parsed);
  } catch {
    return {};
  }
}

export function savePersistedSettings(settings: VaultSettings): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}
