import assert from "node:assert/strict";
import test from "node:test";
import {
  addLibraryFolder,
  assignPagesToFolder,
  clearLegacyLibraryStorage,
  createLibraryFolder,
  createLibraryFolderUnder,
  deleteLibraryFolder,
  folderDescendantIds,
  folderLabelPath,
  loadLibraryOrganization,
  pickLegacyLibraryToMigrate,
  renameLibraryFolder,
  saveLibraryOrganization,
  scanLegacyLibraryStorage,
  staleLegacyVaultPaths,
} from "./libraryFolders.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function useMemoryStorage() {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
}

test("library organization is isolated by vault", () => {
  useMemoryStorage();
  const folder = createLibraryFolder("论文");
  saveLibraryOrganization("vault-a", { schemaVersion: 1, revision: 0, folders: [folder], assignments: { "sources/paper": folder.id } });

  assert.deepEqual(loadLibraryOrganization("vault-a"), {
    schemaVersion: 1,
    revision: 0,
    folders: [folder],
    assignments: { "sources/paper": folder.id },
  });
  assert.deepEqual(loadLibraryOrganization("vault-b"), { schemaVersion: 1, revision: 0, folders: [], assignments: {} });
});

test("library organization tolerates invalid persisted data", () => {
  useMemoryStorage();
  localStorage.setItem("centaur.library:vault", "not-json");
  assert.deepEqual(loadLibraryOrganization("vault"), { schemaVersion: 1, revision: 0, folders: [], assignments: {} });
});

test("nested folders keep parentId and can be renamed or deleted", () => {
  const parent = createLibraryFolder("论文");
  const child = createLibraryFolderUnder("2024", parent.id);
  let org = { schemaVersion: 1 as const, revision: 0, folders: [parent, child], assignments: { a: child.id, b: parent.id } };
  org = renameLibraryFolder(org, child.id, "2025");
  assert.equal(org.folders.find((folder) => folder.id === child.id)?.name, "2025");
  assert.deepEqual([...folderDescendantIds(org.folders, parent.id)].sort(), [parent.id, child.id].sort());
  assert.equal(folderLabelPath(org.folders, child.id), "论文 / 2025");

  org = deleteLibraryFolder(org, child.id);
  assert.equal(org.folders.length, 1);
  assert.equal(org.assignments.a, parent.id);
  assert.equal(org.assignments.b, parent.id);
});

test("deleting a root folder uncategorized its papers and children", () => {
  const parent = createLibraryFolder("论文");
  const child = createLibraryFolderUnder("2024", parent.id);
  const org = deleteLibraryFolder(
    { schemaVersion: 1, revision: 0, folders: [parent, child], assignments: { a: child.id } },
    parent.id,
  );
  assert.deepEqual(org.folders, []);
  assert.deepEqual(org.assignments, {});
});

test("assigning pages moves them between folders", () => {
  const folder = createLibraryFolder("综述");
  let org = { schemaVersion: 1 as const, revision: 0, folders: [folder], assignments: {} };
  org = assignPagesToFolder(org, ["p1", "p2"], folder.id);
  assert.deepEqual(org.assignments, { p1: folder.id, p2: folder.id });
  org = assignPagesToFolder(org, ["p1"], null);
  assert.deepEqual(org.assignments, { p2: folder.id });
});

test("addLibraryFolder rejects duplicate sibling names", () => {
  const parent = createLibraryFolder("论文");
  let org = { schemaVersion: 1 as const, revision: 0, folders: [parent], assignments: {} };
  org = addLibraryFolder(org, "2024", parent.id);
  const once = org.folders.length;
  org = addLibraryFolder(org, "2024", parent.id);
  assert.equal(org.folders.length, once);
  org = addLibraryFolder(org, "2024", null);
  assert.equal(org.folders.length, once + 1);
});

test("normalize drops folder parent cycles", () => {
  useMemoryStorage();
  const a = { id: "a", name: "A", parentId: "b" };
  const b = { id: "b", name: "B", parentId: "a" };
  saveLibraryOrganization("vault", { schemaVersion: 1, revision: 1, folders: [a, b], assignments: {} });
  const loaded = loadLibraryOrganization("vault");
  assert.equal(loaded.folders.every((folder) => folder.parentId == null || loaded.folders.some((item) => item.id === folder.parentId)), true);
  assert.equal(loaded.folders.some((folder) => folder.parentId === folder.id), false);
});

test("legacy localStorage scan migrates empty remote and clears stale keys", () => {
  useMemoryStorage();
  const folder = createLibraryFolder("旧分类");
  saveLibraryOrganization("C:\\\\old\\\\vault", { schemaVersion: 1, revision: 0, folders: [folder], assignments: { paper: folder.id } });
  saveLibraryOrganization("C:\\\\moved\\\\vault", { schemaVersion: 1, revision: 0, folders: [folder], assignments: { paper: folder.id } });

  const scanned = scanLegacyLibraryStorage();
  assert.equal(scanned.length, 2);

  const remote = { schemaVersion: 1 as const, revision: 3, folders: [], assignments: {} };
  const migrated = pickLegacyLibraryToMigrate(remote, scanned.map((entry) => loadLibraryOrganization(entry.vaultPath)));
  assert.equal(migrated?.revision, 3);
  assert.equal(migrated?.folders[0]?.name, "旧分类");

  const current = { schemaVersion: 1 as const, revision: 4, folders: [folder], assignments: { paper: folder.id } };
  const stale = staleLegacyVaultPaths(current);
  assert.equal(stale.length, 2);
  const removed = clearLegacyLibraryStorage(stale);
  assert.equal(removed.length, 2);
  assert.equal(scanLegacyLibraryStorage().length, 0);
});
