import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { IdeaStorage } from "./idea-storage.js";

test("IdeaStorage persists, updates, and remaps page targets", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-ideas-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storage = new IdeaStorage(root);
  const idea = await storage.create({
    content: "A human thought",
    target: { kind: "page", pageId: "notes/old/item" },
    selector: { exact: "selected text", prefix: "before ", suffix: " after", start: 7, end: 20, revision: "abc" },
  });

  assert.equal((await storage.list())[0].content, "A human thought");
  const updated = await storage.update(idea.id, { status: "resolved" });
  assert.equal(updated.status, "resolved");

  await storage.remapPage("notes/old", "notes/new", true);
  const remapped = (await storage.list())[0];
  assert.deepEqual(remapped.target, { kind: "page", pageId: "notes/new/item" });
  assert.equal(await storage.delete(idea.id), true);
  assert.deepEqual(await storage.list(), []);
});
