import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { VaultSettingsSchema, type VaultSettings } from "@wikihome/engine-api";

export function configDir(): string {
  if (process.env.WIKIHOME_CONFIG_DIR) return process.env.WIKIHOME_CONFIG_DIR;
  if (process.env.APPDATA) return path.join(process.env.APPDATA, "Ruezz");
  return path.join(os.homedir(), ".ruezz");
}

function legacyConfigDirs(): string[] {
  if (process.env.WIKIHOME_CONFIG_DIR) return [];
  const dirs: string[] = [];
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, "Centaur"));
    dirs.push(path.join(process.env.APPDATA, "WikiHome"));
  }
  dirs.push(path.join(os.homedir(), ".centaur"));
  dirs.push(path.join(os.homedir(), ".wikihome"));
  return dirs;
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
    const files = [path.join(configDir(), "settings.json")];
    for (const legacyDir of legacyConfigDirs()) {
      const legacyFile = path.join(legacyDir, "settings.json");
      if (legacyFile !== files[0]) files.push(legacyFile);
    }
    const file = files.find((candidate) => existsSync(candidate));
    if (!file) return {};
    const parsed = decryptSettings(JSON.parse(readFileSync(file, "utf8")) as unknown);
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
  const persisted = encryptSettings(settings);
  writeFileSync(tmp, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    /* Windows protects APPDATA with the current user's ACL. */
  }
  try {
    renameSync(tmp, file);
  } catch {
    copyFileSync(tmp, file);
    try {
      unlinkSync(tmp);
    } catch {
      /* antivirus may lock the temp file briefly */
    }
  }
}

const DPAPI_PREFIX = "dpapi:v1:";

function encryptSettings(settings: VaultSettings): VaultSettings {
  if (process.platform !== "win32") return settings;
  return {
    ...settings,
    apiKey: protectSecret(settings.apiKey),
    providers: settings.providers.map((provider) => ({
      ...provider,
      apiKey: protectSecret(provider.apiKey),
    })),
  };
}

function decryptSettings(value: unknown): unknown {
  if (process.platform !== "win32" || !value || typeof value !== "object") return value;
  const settings = value as Record<string, unknown>;
  const providers = Array.isArray(settings.providers)
    ? settings.providers.map((raw) => {
        if (!raw || typeof raw !== "object") return raw;
        const provider = raw as Record<string, unknown>;
        return { ...provider, apiKey: unprotectSecret(provider.apiKey) };
      })
    : settings.providers;
  return { ...settings, apiKey: unprotectSecret(settings.apiKey), providers };
}

function protectSecret(value: string): string {
  if (!value || value.startsWith(DPAPI_PREFIX)) return value;
  const script = [
    "Add-Type -AssemblyName System.Security",
    "$plain = [Console]::In.ReadToEnd()",
    "$bytes = [Text.Encoding]::UTF8.GetBytes($plain)",
    "$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')",
    "[Console]::Out.Write([Convert]::ToBase64String($protected))",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: value,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("无法使用 Windows DPAPI 加密 API Key");
  }
  return `${DPAPI_PREFIX}${result.stdout.trim()}`;
}

function unprotectSecret(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith(DPAPI_PREFIX)) return String(value ?? "");
  const script = [
    "Add-Type -AssemblyName System.Security",
    "$encoded = [Console]::In.ReadToEnd()",
    "$bytes = [Convert]::FromBase64String($encoded)",
    "$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')",
    "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: value.slice(DPAPI_PREFIX.length),
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("无法使用 Windows DPAPI 解密 API Key");
  return result.stdout;
}
