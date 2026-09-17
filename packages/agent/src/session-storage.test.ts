import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SessionStorage } from "./session-storage.js";

test("load deterministically migrates and persists legacy message IDs", async (t) => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-session-test-"));
  t.after(() => fs.rm(vaultRoot, { recursive: true, force: true }));

  const storage = new SessionStorage(vaultRoot);
  await storage.init();
  const sessionId = "sess_legacy_test";
  const sessionPath = path.join(vaultRoot, ".wikihome", "sessions", `${sessionId}.json`);
  const legacySession = {
    id: sessionId,
    title: "Legacy",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:01:00.000Z",
    model: { provider: "test", modelId: "test" },
    linkedPageIds: [],
    attachments: [],
    messages: [
      { role: "user", content: "hello", timestamp: 1 },
      { role: "assistant", content: "", timestamp: 2, toolCalls: [{ id: "call_1", name: "read_page", args: {} }] },
      { role: "toolResult", toolCallId: "call_1", toolName: "read_page", content: "result", isError: false, timestamp: 3 },
      { role: "assistant", content: "answer", timestamp: 4 },
    ],
  };
  const legacyJson = JSON.stringify(legacySession, null, 2);
  await fs.writeFile(sessionPath, legacyJson, "utf-8");

  const migrated = await storage.load(sessionId);
  assert.ok(migrated);
  const ids = migrated.messages.map((message) => message.id);
  assert.equal(new Set(ids).size, legacySession.messages.length);
  assert.ok(ids.every((id) => /^msg_legacy_[a-f0-9]{24}$/.test(id)));

  const persisted = JSON.parse(await fs.readFile(sessionPath, "utf-8")) as typeof migrated;
  assert.deepEqual(persisted.messages.map((message) => message.id), ids);
  assert.deepEqual((await storage.load(sessionId))?.messages.map((message) => message.id), ids);

  const summaries = await storage.list();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].messageCount, legacySession.messages.length);

  persisted.messages.reverse();
  await fs.writeFile(sessionPath, JSON.stringify(persisted, null, 2), "utf-8");
  assert.deepEqual((await storage.load(sessionId))?.messages.map((message) => message.id), [...ids].reverse());

  await fs.writeFile(sessionPath, legacyJson, "utf-8");
  assert.deepEqual((await storage.load(sessionId))?.messages.map((message) => message.id), ids);
});
