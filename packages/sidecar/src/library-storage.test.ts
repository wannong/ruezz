import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadLibrary, saveLibrary } from "./library-storage.js";

test("library storage persists nested folders and rejects stale revisions", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-library-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const parent = { id: "folder-parent", name: "论文", parentId: null };
  const child = { id: "folder-child", name: "2024", parentId: "folder-parent" };
  const saved = await saveLibrary(root, {
    schemaVersion: 1,
    revision: 0,
    folders: [parent, child, { id: "bad", name: "x", parentId: "missing" }, { id: "loop", name: "loop", parentId: "loop" }],
    assignments: { paper: "folder-child", ghost: "nope" },
  });

  assert.equal(saved.revision, 1);
  assert.equal(saved.folders.find((folder) => folder.id === "bad")?.parentId, null);
  assert.equal(saved.folders.find((folder) => folder.id === "loop")?.parentId, null);
  assert.equal(saved.assignments.paper, "folder-child");
  assert.equal(saved.assignments.ghost, undefined);

  const loaded = await loadLibrary(root);
  assert.deepEqual(loaded, saved);

  await assert.rejects(
    () => saveLibrary(root, { ...saved, folders: [parent] }, 0),
    /其他窗口修改/,
  );

  const next = await saveLibrary(root, { ...saved, folders: [parent, child] }, saved.revision);
  assert.equal(next.revision, 2);
  assert.equal(next.folders.length, 2);
});
