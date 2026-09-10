import type { PageSummary } from "../api";

export type FileTreeNode = {
  name: string;
  path: string;
  page?: PageSummary;
  children: FileTreeNode[];
};

export function buildFileTree(pages: PageSummary[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", children: [] };

  for (const page of pages) {
    const parts = page.id.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      const isLeaf = i === parts.length - 1;
      let child = cursor.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path, children: [] };
        cursor.children.push(child);
      }
      if (isLeaf) child.page = page;
      cursor = child;
    }
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
