import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SidecarSession } from "./server.js";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-smoke-"));
  const session = new SidecarSession({ mock: true, vaultPath: root });

  const init = await session.handle({ id: 1, method: "vault_init", params: { root } });
  if (init.error) throw new Error(init.error.message);

  const src = path.join(root, "raw", "sources", "paper.md");
  await fs.mkdir(path.dirname(src), { recursive: true });
  await fs.writeFile(src, "We propose attention.\n", "utf8");

  const ingest = await session.handle({
    id: 2,
    method: "vault_ingest",
    params: { path: src },
  });
  if (ingest.error) throw new Error(`ingest failed: ${ingest.error.message}`);

  const pages = await session.handle({ id: 3, method: "vault_list_pages", params: {} });
  if (pages.error) throw new Error(pages.error.message);
  const list = pages.result as Array<{ id: string }>;
  if (!list.some((p) => p.id.includes("attention"))) {
    throw new Error(`expected attention page, got ${JSON.stringify(list)}`);
  }

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

  session.close();
  console.log("smoke ok", { root, pages: list.length, answerPreview: answer.slice(0, 80) });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
