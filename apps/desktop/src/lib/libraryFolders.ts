export type LibraryFolder = {
  id: string;
  name: string;
};

export type LibraryOrganization = {
  folders: LibraryFolder[];
  assignments: Record<string, string>;
};

const keyFor = (vaultPath: string) => `centaur.library:${vaultPath || "default"}`;

export function loadLibraryOrganization(vaultPath: string): LibraryOrganization {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(vaultPath)) ?? "null") as Partial<LibraryOrganization> | null;
    return {
      folders: Array.isArray(parsed?.folders)
        ? parsed.folders.filter((folder): folder is LibraryFolder => Boolean(folder?.id && folder?.name))
        : [],
      assignments: parsed?.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {},
    };
  } catch {
    return { folders: [], assignments: {} };
  }
}

export function saveLibraryOrganization(vaultPath: string, value: LibraryOrganization): void {
  localStorage.setItem(keyFor(vaultPath), JSON.stringify(value));
}

export function createLibraryFolder(name: string): LibraryFolder {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
  };
}
