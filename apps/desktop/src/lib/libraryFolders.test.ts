import assert from "node:assert/strict";
import test from "node:test";
import { createLibraryFolder, loadLibraryOrganization, saveLibraryOrganization } from "./libraryFolders.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("library organization is isolated by vault", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  const folder = createLibraryFolder("论文");
  saveLibraryOrganization("vault-a", { folders: [folder], assignments: { "sources/paper": folder.id } });

  assert.deepEqual(loadLibraryOrganization("vault-a"), {
    folders: [folder],
    assignments: { "sources/paper": folder.id },
  });
  assert.deepEqual(loadLibraryOrganization("vault-b"), { folders: [], assignments: {} });
});

test("library organization tolerates invalid persisted data", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  localStorage.setItem("centaur.library:vault", "not-json");
  assert.deepEqual(loadLibraryOrganization("vault"), { folders: [], assignments: {} });
});
