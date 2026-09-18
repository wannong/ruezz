import type { LibraryFolder, LibraryOrganization } from "../api";

export type { LibraryFolder, LibraryOrganization };

export const LEGACY_LIBRARY_PREFIX = "centaur.library:";

export function emptyLibraryOrganization(): LibraryOrganization {
  return { schemaVersion: 1, revision: 0, folders: [], assignments: {} };
}

export function legacyLibraryStorageKey(vaultPath: string): string {
  return `${LEGACY_LIBRARY_PREFIX}${vaultPath}`;
}

export function normalizeLibraryOrganization(value: unknown): LibraryOrganization {
  if (!value || typeof value !== "object") return emptyLibraryOrganization();
  const raw = value as Partial<LibraryOrganization>;
  const folders = Array.isArray(raw.folders)
    ? raw.folders.flatMap((item): LibraryFolder[] => {
        if (!item || typeof item !== "object") return [];
        const folder = item as Partial<LibraryFolder>;
        if (typeof folder.id !== "string" || !folder.id) return [];
        if (typeof folder.name !== "string" || !folder.name.trim()) return [];
        return [{
          id: folder.id,
          name: folder.name.trim(),
          parentId: typeof folder.parentId === "string" ? folder.parentId : null,
        }];
      })
    : [];
  const ids = new Set(folders.map((folder) => folder.id));
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    if (!folder.parentId) continue;
    if (!ids.has(folder.parentId) || folder.parentId === folder.id || parentCycle(byId, folder.id, folder.parentId)) {
      folder.parentId = null;
    }
  }
  const assignments: Record<string, string> = {};
  if (raw.assignments && typeof raw.assignments === "object") {
    for (const [pageId, folderId] of Object.entries(raw.assignments)) {
      if (typeof folderId === "string" && ids.has(folderId)) assignments[pageId] = folderId;
    }
  }
  return {
    schemaVersion: 1,
    revision: Number(raw.revision) || 0,
    folders,
    assignments,
  };
}

function parentCycle(byId: Map<string, LibraryFolder>, folderId: string, parentId: string): boolean {
  const seen = new Set<string>([folderId]);
  let current: string | null = parentId;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export function loadLibraryOrganization(vaultPath: string): LibraryOrganization {
  try {
    const parsed = JSON.parse(localStorage.getItem(legacyLibraryStorageKey(vaultPath)) ?? "null") as unknown;
    return normalizeLibraryOrganization(parsed);
  } catch {
    return emptyLibraryOrganization();
  }
}

export function saveLibraryOrganization(vaultPath: string, value: LibraryOrganization): void {
  localStorage.setItem(legacyLibraryStorageKey(vaultPath), JSON.stringify(normalizeLibraryOrganization(value)));
}

export function createLibraryFolder(name: string): LibraryFolder {
  return createLibraryFolderUnder(name, null);
}

export function createLibraryFolderUnder(name: string, parentId: string | null): LibraryFolder {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    parentId,
  };
}

export function siblingFolderNameTaken(
  folders: LibraryFolder[],
  name: string,
  parentId: string | null,
  exceptId?: string,
): boolean {
  const trimmed = name.trim();
  return folders.some((folder) => folder.parentId === parentId && folder.id !== exceptId && folder.name === trimmed);
}

export function uniqueFolderName(folders: LibraryFolder[], parentId: string | null, base = "未命名文件夹"): string {
  if (!siblingFolderNameTaken(folders, base, parentId)) return base;
  let index = 2;
  while (siblingFolderNameTaken(folders, `${base} ${index}`, parentId)) index += 1;
  return `${base} ${index}`;
}

export function folderDescendantIds(folders: LibraryFolder[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        added = true;
      }
    }
  }
  return ids;
}

export function folderLabelPath(folders: LibraryFolder[], folderId: string): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" / ");
}

export function sortedLibraryFolders(folders: LibraryFolder[]): LibraryFolder[] {
  return [...folders].sort((a, b) => folderLabelPath(folders, a.id).localeCompare(folderLabelPath(folders, b.id), "zh"));
}

export function addLibraryFolder(
  org: LibraryOrganization,
  name: string,
  parentId: string | null,
): LibraryOrganization {
  const trimmed = name.trim();
  const parent = parentId && org.folders.some((folder) => folder.id === parentId) ? parentId : null;
  if (!trimmed || siblingFolderNameTaken(org.folders, trimmed, parent)) return org;
  return {
    ...org,
    folders: [...org.folders, createLibraryFolderUnder(trimmed, parent)],
  };
}

export function renameLibraryFolder(org: LibraryOrganization, folderId: string, name: string): LibraryOrganization {
  const trimmed = name.trim();
  const folder = org.folders.find((item) => item.id === folderId);
  if (!folder || !trimmed || trimmed === folder.name) return org;
  if (siblingFolderNameTaken(org.folders, trimmed, folder.parentId, folderId)) return org;
  return {
    ...org,
    folders: org.folders.map((item) => (item.id === folderId ? { ...item, name: trimmed } : item)),
  };
}

export function deleteLibraryFolder(org: LibraryOrganization, folderId: string): LibraryOrganization {
  const folder = org.folders.find((item) => item.id === folderId);
  if (!folder) return org;
  const removing = folderDescendantIds(org.folders, folderId);
  const fallback = folder.parentId && !removing.has(folder.parentId) ? folder.parentId : null;
  const folders = org.folders.filter((item) => !removing.has(item.id));
  const assignments: Record<string, string> = {};
  for (const [pageId, assigned] of Object.entries(org.assignments)) {
    if (!removing.has(assigned)) assignments[pageId] = assigned;
    else if (fallback) assignments[pageId] = fallback;
  }
  return { ...org, folders, assignments };
}

export function assignPagesToFolder(
  org: LibraryOrganization,
  pageIds: string[],
  folderId: string | null,
): LibraryOrganization {
  const valid = folderId && org.folders.some((folder) => folder.id === folderId) ? folderId : null;
  const assignments = { ...org.assignments };
  for (const pageId of pageIds) {
    if (valid) assignments[pageId] = valid;
    else delete assignments[pageId];
  }
  return { ...org, assignments };
}

export function pickLegacyLibraryToMigrate(
  remote: LibraryOrganization,
  candidates: LibraryOrganization[],
): LibraryOrganization | null {
  if (remote.folders.length > 0 || Object.keys(remote.assignments).length > 0) return null;
  for (const candidate of candidates) {
    const local = normalizeLibraryOrganization(candidate);
    if (local.folders.length > 0 || Object.keys(local.assignments).length > 0) {
      return { ...local, revision: remote.revision };
    }
  }
  return null;
}

export type LegacyLibraryEntry = {
  key: string;
  vaultPath: string;
  folders: number;
  assignments: number;
};

export function scanLegacyLibraryStorage(): LegacyLibraryEntry[] {
  const entries: LegacyLibraryEntry[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(LEGACY_LIBRARY_PREFIX)) continue;
    const vaultPath = key.slice(LEGACY_LIBRARY_PREFIX.length);
    const value = loadLibraryOrganization(vaultPath);
    entries.push({
      key,
      vaultPath,
      folders: value.folders.length,
      assignments: Object.keys(value.assignments).length,
    });
  }
  return entries;
}

export function clearLegacyLibraryStorage(vaultPaths: string[]): string[] {
  const removed: string[] = [];
  for (const vaultPath of vaultPaths) {
    const key = legacyLibraryStorageKey(vaultPath);
    if (localStorage.getItem(key) == null) continue;
    localStorage.removeItem(key);
    removed.push(key);
  }
  return removed;
}

export function staleLegacyVaultPaths(current: LibraryOrganization): string[] {
  return scanLegacyLibraryStorage()
    .filter((entry) => {
      if (entry.folders === 0 && entry.assignments === 0) return true;
      const local = loadLibraryOrganization(entry.vaultPath);
      const remoteIds = new Set(current.folders.map((folder) => folder.id));
      return local.folders.length > 0 && local.folders.every((folder) => remoteIds.has(folder.id));
    })
    .map((entry) => entry.vaultPath);
}
