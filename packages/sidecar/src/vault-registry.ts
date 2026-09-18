import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJsonAtomic } from "./atomic-json.js";

export type VaultRegistryEntry = {
  vaultId: string;
  displayName: string;
  currentPath: string;
  pathHistory: Array<{ path: string; firstSeenAt: string; lastSeenAt: string; status: "available" | "missing" }>;
  createdAt: string;
  lastOpenedAt: string;
  lastVerifiedAt: string;
  status: "available" | "missing";
};

type VaultRegistry = { schemaVersion: 1; revision: number; activeVaultId: string; vaults: Record<string, VaultRegistryEntry> };

const emptyRegistry = (): VaultRegistry => ({ schemaVersion: 1, revision: 0, activeVaultId: "", vaults: {} });

function registryFile(configDir: string): string {
  return path.join(configDir, "vault-registry.json");
}

export async function loadVaultRegistry(configDir: string): Promise<VaultRegistry> {
  const value = await readJson<Partial<VaultRegistry>>(registryFile(configDir), {});
  if (!value || typeof value !== "object" || !value.vaults || typeof value.vaults !== "object") return emptyRegistry();
  return { schemaVersion: 1, revision: Number(value.revision) || 0, activeVaultId: String(value.activeVaultId ?? ""), vaults: value.vaults as Record<string, VaultRegistryEntry> };
}

export async function saveVaultRegistry(configDir: string, registry: VaultRegistry): Promise<void> {
  await writeJsonAtomic(registryFile(configDir), registry);
}

export async function registerVault(configDir: string, metadata: { vaultId: string; createdAt: string }, root: string): Promise<VaultRegistryEntry> {
  const registry = await loadVaultRegistry(configDir);
  const now = new Date().toISOString();
  const existing = registry.vaults[metadata.vaultId];
  const oldPath = existing?.currentPath;
  const history = existing?.pathHistory ? [...existing.pathHistory] : [];
  if (!history.some((item) => item.path === root)) history.push({ path: root, firstSeenAt: now, lastSeenAt: now, status: "available" });
  for (const item of history) {
    if (item.path === root) { item.lastSeenAt = now; item.status = "available"; }
    else if (oldPath && item.path === oldPath) item.status = "missing";
  }
  const entry: VaultRegistryEntry = {
    vaultId: metadata.vaultId,
    displayName: existing?.displayName || path.basename(root),
    currentPath: root,
    pathHistory: history,
    createdAt: existing?.createdAt || metadata.createdAt,
    lastOpenedAt: now,
    lastVerifiedAt: now,
    status: "available",
  };
  registry.vaults[metadata.vaultId] = entry;
  registry.activeVaultId = metadata.vaultId;
  registry.revision += 1;
  await saveVaultRegistry(configDir, registry);
  return entry;
}

export async function markRegistryPathStates(configDir: string): Promise<VaultRegistry> {
  const registry = await loadVaultRegistry(configDir);
  let changed = false;
  for (const entry of Object.values(registry.vaults)) {
    const available = await fs.stat(entry.currentPath).then((info) => info.isDirectory()).catch(() => false);
    const status = available ? "available" : "missing";
    if (entry.status !== status) { entry.status = status; changed = true; }
  }
  if (changed) { registry.revision += 1; await saveVaultRegistry(configDir, registry); }
  return registry;
}
