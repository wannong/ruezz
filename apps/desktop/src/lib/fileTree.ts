import type { PageSummary } from "../api";

export type FileTreeNode = {
  name: string;
  path: string;
  page?: PageSummary;
  children: FileTreeNode[];
};

export type WikiClip = { kind: "page" | "folder"; id: string };

export function parentWikiId(id: string): string {
  const i = id.lastIndexOf("/");
  return i === -1 ? "" : id.slice(0, i);
}

export function joinWikiId(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function uniqueCopyId(id: string, taken: Set<string>): string {
  const parent = parentWikiId(id);
  const name = id.slice(parent ? parent.length + 1 : 0);
  const make = (n: string) => joinWikiId(parent, n);
  const first = make(`${name}-copy`);
  if (!taken.has(first)) return first;
  for (let i = 2; ; i++) {
    const cand = make(`${name}-copy-${i}`);
    if (!taken.has(cand)) return cand;
  }
}

export function uniqueChildId(parent: string, base: string, taken: Set<string>): string {
  const first = joinWikiId(parent, base);
  if (!taken.has(first)) return first;
  for (let i = 2; ; i++) {
    const cand = joinWikiId(parent, `${base}-${i}`);
    if (!taken.has(cand)) return cand;
  }
}

export function pasteDest(clipId: string, targetFolder: string, taken: Set<string>): string {
  const baseName = clipId.split("/").pop() ?? clipId;
  const desired = joinWikiId(targetFolder, baseName);
  if (desired !== clipId && !taken.has(desired)) return desired;
  return uniqueCopyId(desired, taken);
}

export function validNameSegment(name: string): string | null {
  const t = name.trim();
  if (!t || t === "." || t === "..") return null;
  if (/[\\/<>:"|?*\u0000]/.test(t)) return null;
  return t;
}

export function buildFileTree(pages: PageSummary[], folders: string[] = []): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", children: [] };

  const ensure = (parts: string[], page?: PageSummary) => {
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const id = parts.slice(0, i + 1).join("/");
      const isLeaf = i === parts.length - 1;
      let child = cursor.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path: id, children: [] };
        cursor.children.push(child);
      }
      if (isLeaf && page) child.page = page;
      cursor = child;
    }
  };

  for (const page of pages) {
    const parts = page.id.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    ensure(parts, page);
  }
  for (const folder of folders) {
    const parts = folder.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    ensure(parts);
  }

  sortTree(root);
  return root.children;
}

function sortTree(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    const aDir = a.children.length > 0 && !a.page ? 0 : a.children.length > 0 ? 0 : 1;
    const bDir = b.children.length > 0 && !b.page ? 0 : b.children.length > 0 ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name, "zh");
  });
  for (const child of node.children) sortTree(child);
}

export function vaultName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
