import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SidecarSession } from "./server.js";

async function main() {
  const cfg = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-config-"));
  process.env.WIKIHOME_CONFIG_DIR = cfg;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-smoke-"));
  const session = new SidecarSession({ mock: true, vaultPath: root });

  const init = await session.handle({ id: 1, method: "vault_init", params: { root } });
  if (init.error) throw new Error(init.error.message);

  const src = path.join(root, "raw", "sources", "paper.md");
  await fs.mkdir(path.dirname(src), { recursive: true });
  await fs.writeFile(
    src,
    [
      "# Attention",
      "",
      "We propose attention.",
      "",
      "## Architecture",
      "",
      "The core idea stays in one page.",
      "",
    ].join("\n"),
    "utf8",
  );

  const ingest = await session.handle({
    id: 2,
    method: "vault_ingest",
    params: { path: src },
  });
  if (ingest.error) throw new Error(`ingest failed: ${ingest.error.message}`);

  const pages = await session.handle({ id: 3, method: "vault_list_pages", params: {} });
  if (pages.error) throw new Error(pages.error.message);
  const list = pages.result as Array<{ id: string }>;
  const sourcePages = list.filter((p) => p.id.startsWith("sources/"));
  if (sourcePages.length !== 1 || sourcePages[0]?.id !== "sources/paper") {
    throw new Error(`expected one whole-document page sources/paper, got ${JSON.stringify(list)}`);
  }
  if (list.some((p) => /architecture/i.test(p.id))) {
    throw new Error(`ingest split headings into extra pages: ${JSON.stringify(list)}`);
  }
  const imported = await session.handle({
    id: 31,
    method: "vault_read_page",
    params: { id: "sources/paper" },
  });
  if (imported.error) throw new Error(imported.error.message);
  const importedPage = imported.result as { body: string };
  if (!importedPage.body.includes("## Architecture") || !importedPage.body.includes("We propose attention.")) {
    throw new Error(`source page lost original sections: ${JSON.stringify(importedPage)}`);
  }

  const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-external-"));
  const externalFile = path.join(externalDir, "approved.md");
  await fs.writeFile(externalFile, "# Approved external source\n", "utf8");
  const deniedExternal = await session.handle({
    id: 101,
    method: "vault_ingest",
    params: { path: externalFile, approvedExternal: true },
  });
  if (!deniedExternal.error || !deniedExternal.error.message.includes("需要用户审核")) {
    throw new Error(`expected external import denial, got ${JSON.stringify(deniedExternal)}`);
  }
  const approvedExternal = await session.handle(
    {
      id: 102,
      method: "vault_ingest",
      params: { path: externalFile, approvedExternal: true },
    },
    undefined,
    { allowExternalImport: true, exposeSecrets: true },
  );
  if (approvedExternal.error) throw new Error(`approved import failed: ${approvedExternal.error.message}`);

  const ask = await session.handle({
    id: 4,
    method: "vault_ask",
    params: { question: "what is attention?" },
  });
  if (ask.error) throw new Error(ask.error.message);
  const answer = (ask.result as { answer: string }).answer;
  if (!/attention/i.test(answer)) throw new Error(`bad answer: ${answer}`);

  const lint = await session.handle({ id: 5, method: "vault_lint", params: {} });
  if (lint.error) throw new Error(lint.error.message);

  const search = await session.handle({
    id: 6,
    method: "vault_search",
    params: { query: "attention" },
  });
  if (search.error) throw new Error(search.error.message);
  const hits = search.result as Array<{ id: string }>;
  if (!hits.some((h) => h.id === "sources/paper" || /attention/i.test(h.id))) {
    throw new Error(`expected search hit for sources/paper, got ${JSON.stringify(hits)}`);
  }

  const graphRes = await session.handle({ id: 7, method: "vault_graph", params: {} });
  if (graphRes.error) throw new Error(graphRes.error.message);
  const graph = graphRes.result as { nodes: unknown[]; edges: unknown[] };
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error(`expected graph nodes, got ${JSON.stringify(graph)}`);
  }

  const sampleId = "sources/paper";
  const written = await session.handle({
    id: 8,
    method: "vault_write_page",
    params: {
      id: sampleId,
      raw: `---\ntype: concept\ntitle: Attention\n---\nEdited attention body.\n`,
    },
  });
  if (written.error) throw new Error(written.error.message);
  const writtenPage = written.result as { body: string; raw: string };
  if (!writtenPage.body.includes("Edited attention body")) {
    throw new Error(`write did not persist body: ${JSON.stringify(writtenPage)}`);
  }

  const created = await session.handle({
    id: 9,
    method: "vault_create_page",
    params: { id: "notes/hello", title: "Hello" },
  });
  if (created.error) throw new Error(created.error.message);
  const createdPage = created.result as { id: string; title?: string };
  if (createdPage.id !== "notes/hello") {
    throw new Error(`expected created id notes/hello, got ${JSON.stringify(createdPage)}`);
  }

  const listed = await session.handle({ id: 10, method: "vault_list_pages", params: {} });
  if (listed.error) throw new Error(listed.error.message);
  const after = listed.result as Array<{ id: string }>;
  if (!after.some((p) => p.id === "notes/hello")) {
    throw new Error(`expected new page in list, got ${JSON.stringify(after)}`);
  }

  const folder = await session.handle({
    id: 12,
    method: "vault_create_folder",
    params: { id: "drafts" },
  });
  if (folder.error) throw new Error(folder.error.message);

  const folders = await session.handle({ id: 13, method: "vault_list_folders", params: {} });
  if (folders.error) throw new Error(folders.error.message);
  const folderIds = folders.result as string[];
  if (!folderIds.includes("drafts")) {
    throw new Error(`expected drafts folder, got ${JSON.stringify(folderIds)}`);
  }

  const copied = await session.handle({
    id: 14,
    method: "vault_copy_page",
    params: { from: "notes/hello", to: "drafts/hello" },
  });
  if (copied.error) throw new Error(copied.error.message);
  const copiedPage = copied.result as { id: string };
  if (copiedPage.id !== "drafts/hello") {
    throw new Error(`expected drafts/hello, got ${JSON.stringify(copiedPage)}`);
  }

  const renamed = await session.handle({
    id: 15,
    method: "vault_rename_page",
    params: { from: "drafts/hello", to: "drafts/renamed" },
  });
  if (renamed.error) throw new Error(renamed.error.message);
  if ((renamed.result as { id: string }).id !== "drafts/renamed") {
    throw new Error(`expected drafts/renamed, got ${JSON.stringify(renamed.result)}`);
  }

  const copiedFolder = await session.handle({
    id: 16,
    method: "vault_copy_folder",
    params: { from: "drafts", to: "inbox" },
  });
  if (copiedFolder.error) throw new Error(copiedFolder.error.message);

  const renamedFolder = await session.handle({
    id: 17,
    method: "vault_rename_folder",
    params: { from: "inbox", to: "stash" },
  });
  if (renamedFolder.error) throw new Error(renamedFolder.error.message);

  const afterMove = await session.handle({ id: 18, method: "vault_list_pages", params: {} });
  if (afterMove.error) throw new Error(afterMove.error.message);
  const moved = afterMove.result as Array<{ id: string }>;
  if (!moved.some((p) => p.id === "stash/renamed") || moved.some((p) => p.id === "drafts/hello")) {
    throw new Error(`folder copy/rename mismatch: ${JSON.stringify(moved)}`);
  }

  const backlinks = await session.handle({
    id: 11,
    method: "vault_backlinks",
    params: { id: sampleId },
  });
  if (backlinks.error) throw new Error(backlinks.error.message);
  if (!Array.isArray(backlinks.result)) {
    throw new Error(`expected backlinks array, got ${JSON.stringify(backlinks.result)}`);
  }

  const revealed = await session.handle({
    id: 19,
    method: "vault_reveal",
    params: { kind: "page", id: "notes/hello", open: false },
  });
  if (revealed.error) throw new Error(revealed.error.message);
  const revealPath = String((revealed.result as { path: string }).path).replace(/\\/g, "/");
  if (!revealPath.endsWith("/wiki/notes/hello.md")) {
    throw new Error(`expected wiki/notes/hello.md, got ${revealPath}`);
  }

  // Test agent session management
  const createSessionRes = await session.handle({
    id: 20,
    method: "agent_session_create",
    params: { title: "测试会话", currentPageId: sampleId },
  });
  if (createSessionRes.error) throw new Error(createSessionRes.error.message);
  const createdSession = (createSessionRes.result as any).session;
  if (!createdSession.id) throw new Error("expected session id");

  const listSessionsRes = await session.handle({ id: 21, method: "agent_session_list", params: {} });
  if (listSessionsRes.error) throw new Error(listSessionsRes.error.message);
  const sessions = (listSessionsRes.result as any).sessions;
  if (!sessions.some((s: any) => s.id === createdSession.id)) {
    throw new Error(`expected created session in list, got ${JSON.stringify(sessions)}`);
  }

  const getSessionRes = await session.handle({
    id: 22,
    method: "agent_session_get",
    params: { id: createdSession.id },
  });
  if (getSessionRes.error) throw new Error(getSessionRes.error.message);
  const retrievedSession = (getSessionRes.result as any).session;
  if (retrievedSession.id !== createdSession.id) {
    throw new Error(`expected session ${createdSession.id}, got ${retrievedSession.id}`);
  }

  const idleAbort = await session.handle({ id: 221, method: "agent_abort" });
  if (idleAbort.error) throw new Error(`idle agent_abort failed: ${idleAbort.error.message}`);
  if ((idleAbort.result as { ok?: boolean }).ok !== false) {
    throw new Error(`expected idle agent_abort ok:false, got: ${JSON.stringify(idleAbort.result)}`);
  }

  const streamEvents: string[] = [];
  const agentPromptRes = await session.handle(
    {
      id: 23,
      method: "agent_prompt",
      params: {
        sessionId: createdSession.id,
        message: "列出所有页面",
        currentPageId: sampleId,
        graphDepth: 1,
      },
    },
    (event) => {
      streamEvents.push(event.type);
    },
  );
  if (agentPromptRes.error) throw new Error(`agent_prompt failed: ${agentPromptRes.error.message}`);
  const promptResult = agentPromptRes.result as any;
  if (!promptResult.answer) throw new Error(`expected answer from agent_prompt, got: ${JSON.stringify(promptResult)}`);
  if (!Array.isArray(promptResult.toolsUsed)) throw new Error("expected toolsUsed array");
  
  // Assert that at least one wiki lookup tool was used
  const wikiTools = ["search_pages", "read_page", "list_pages"];
  const usedWikiTool = promptResult.toolsUsed.some((t: string) => wikiTools.includes(t));
  if (!usedWikiTool) {
    throw new Error(`expected at least one wiki tool to be used, got: ${JSON.stringify(promptResult.toolsUsed)}`);
  }
  if (!streamEvents.includes("tool_start") && !streamEvents.includes("text")) {
    throw new Error(`expected stream events during agent_prompt, got: ${JSON.stringify(streamEvents)}`);
  }

  // Second prompt to verify tool history is preserved
  const secondPromptRes = await session.handle({
    id: 25,
    method: "agent_prompt",
    params: {
      sessionId: createdSession.id,
      message: "读取第一个页面的内容",
      currentPageId: sampleId,
    },
  });
  if (secondPromptRes.error) throw new Error(`second agent_prompt failed: ${secondPromptRes.error.message}`);
  const secondResult = secondPromptRes.result as any;
  if (!secondResult.answer) throw new Error("expected answer from second prompt");

  // Verify session now has tool-related messages (not just two text messages)
  const sessionAfterTwoPrompts = secondResult.session;
  if (sessionAfterTwoPrompts.messages.length < 4) {
    throw new Error(`expected at least 4 messages after two prompts, got ${sessionAfterTwoPrompts.messages.length}`);
  }
  
  // Check that there are assistant messages with toolCalls or toolResult messages
  const hasToolCalls = sessionAfterTwoPrompts.messages.some(
    (m: any) => m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0
  );
  const hasToolResults = sessionAfterTwoPrompts.messages.some((m: any) => m.role === "toolResult");
  
  if (!hasToolCalls && !hasToolResults) {
    throw new Error("expected session history to contain tool calls or tool results");
  }

  session.close();

  // Reopen and test session persistence
  const reopened = new SidecarSession({ mock: true });
  if (reopened.getSettings().vaultPath !== root) {
    throw new Error(`expected persisted vault ${root}, got ${reopened.getSettings().vaultPath}`);
  }

  // Verify session persistence after restart
  const reloadedSessionRes = await reopened.handle({
    id: 24,
    method: "agent_session_get",
    params: { id: createdSession.id },
  });
  if (reloadedSessionRes.error) throw new Error(reloadedSessionRes.error.message);
  const reloadedSession = (reloadedSessionRes.result as any).session;
  if (reloadedSession.messages.length < 2) {
    throw new Error(`expected messages in reloaded session, got ${reloadedSession.messages.length}`);
  }

  const archiveRes = await reopened.handle({
    id: 25,
    method: "agent_session_archive",
    params: { id: createdSession.id, archived: true },
  });
  if (archiveRes.error) throw new Error(archiveRes.error.message);
  const archivedSession = (archiveRes.result as { session: { archived?: boolean } }).session;
  if (!archivedSession.archived) throw new Error("expected session.archived after archive");
  const listAfterArchive = await reopened.handle({ id: 251, method: "agent_session_list", params: {} });
  if (listAfterArchive.error) throw new Error(listAfterArchive.error.message);
  const archivedRow = (
    listAfterArchive.result as { sessions: Array<{ id: string; archived?: boolean }> }
  ).sessions.find((s) => s.id === createdSession.id);
  if (!archivedRow?.archived) {
    throw new Error("expected archived session in list");
  }
  const unarchiveRes = await reopened.handle({
    id: 252,
    method: "agent_session_archive",
    params: { id: createdSession.id, archived: false },
  });
  if (unarchiveRes.error) throw new Error(unarchiveRes.error.message);

  // Test session ID validation (invalid path) — handle() returns { error }, does not throw
  const invalidIdRes = await reopened.handle({
    id: 26,
    method: "agent_session_get",
    params: { id: "../../../etc/passwd" },
  });
  if (!invalidIdRes.error || !String(invalidIdRes.error.message).includes("Invalid session ID")) {
    throw new Error(`expected session ID validation error, got: ${JSON.stringify(invalidIdRes)}`);
  }

  // Changing vaultPath must rebuild the runner so it does not list the old vault's sessions
  const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-smoke-other-"));
  reopened.setSettings({ mock: true, vaultPath: otherRoot });
  const listAfterSettingsChange = await reopened.handle({ id: 27, method: "agent_session_list", params: {} });
  if (listAfterSettingsChange.error) throw new Error(listAfterSettingsChange.error.message);
  const sessionsAfterSwitch = (listAfterSettingsChange.result as { sessions: Array<{ id: string }> }).sessions;
  if (sessionsAfterSwitch.some((s) => s.id === createdSession.id)) {
    throw new Error("agent runner still listed sessions from the previous vault after vaultPath change");
  }

  const emptyBase = await reopened.handle({
    id: 28,
    method: "provider_list_models",
    params: { apiBaseUrl: "", apiKey: "" },
  });
  if (!emptyBase.error || !String(emptyBase.error.message).includes("API Base URL")) {
    throw new Error(`expected empty base url error, got ${JSON.stringify(emptyBase)}`);
  }

  const emptyModel = await reopened.handle({
    id: 29,
    method: "provider_test",
    params: { apiBaseUrl: "http://127.0.0.1:9/v1", apiKey: "", model: "" },
  });
  if (!emptyModel.error || !String(emptyModel.error.message).includes("模型")) {
    throw new Error(`expected missing model error, got ${JSON.stringify(emptyModel)}`);
  }

  reopened.close();
  console.log("smoke ok", {
    root,
    pages: list.length,
    answerPreview: answer.slice(0, 80),
    agentSessionId: createdSession.id,
    agentMessages: reloadedSession.messages.length,
    toolsUsed: promptResult.toolsUsed.join(","),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
