import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJsonAtomic } from "./atomic-json.js";

export type LibraryFolder = { id: string; name: string; parentId: string | null };
export type LibraryOrganization = { schemaVersion: 1; revision: number; folders: LibraryFolder[]; assignments: Record<string, string> };

const empty = (): LibraryOrganization => ({ schemaVersion: 1, revision: 0, folders: [], assignments: {} });
const fileFor = (root: string) => path.join(root, ".wikihome", "library.json");

function normalize(value: unknown): LibraryOrganization {
  if (!value || typeof value !== "object") return empty();
  const raw = value as Partial<LibraryOrganization>;
  const folders = Array.isArray(raw.folders) ? raw.folders.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const folder = item as Partial<LibraryFolder>;
    if (typeof folder.id !== "string" || !folder.id || typeof folder.name !== "string" || !folder.name.trim()) return [];
    return [{ id: folder.id, name: folder.name.trim(), parentId: typeof folder.parentId === "string" ? folder.parentId : null }];
  }) : [];
  const ids = new Set(folders.map((folder) => folder.id));
  for (const folder of folders) if (folder.parentId && (!ids.has(folder.parentId) || folder.parentId === folder.id)) folder.parentId = null;
  const assignments: Record<string, string> = {};
  if (raw.assignments && typeof raw.assignments === "object") {
    for (const [pageId, folderId] of Object.entries(raw.assignments)) if (typeof folderId === "string" && ids.has(folderId)) assignments[pageId] = folderId;
  }
  return { schemaVersion: 1, revision: Number(raw.revision) || 0, folders, assignments };
}

export async function loadLibrary(root: string): Promise<LibraryOrganization> {
  return normalize(await readJson(fileFor(root), empty()));
}

export async function saveLibrary(root: string, value: unknown, expectedRevision?: number): Promise<LibraryOrganization> {
  const current = await loadLibrary(root);
  if (expectedRevision != null && current.revision !== expectedRevision) throw new Error("文献分类已被其他窗口修改，请刷新后重试");
  const next = normalize(value);
  next.revision = current.revision + 1;
  await writeJsonAtomic(fileFor(root), next);
  return next;
}
