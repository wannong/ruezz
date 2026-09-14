import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildSourcePage, oneLineSummary, titleFromMarkdown } from "./ingest-document.js";
import { createEngine } from "./index.js";

test("titleFromMarkdown uses the first heading", () => {
  const body = "# LLM Wiki\n\n## The core idea\n\nHello\n";
  assert.equal(titleFromMarkdown(body, "fallback"), "LLM Wiki");
});

test("buildSourcePage keeps the original markdown intact after frontmatter", () => {
  const body = "# LLM Wiki\n\n## The core idea\n\nMost people's experience looks like RAG.\n\n## Architecture\n\nThree layers.\n";
  const page = buildSourcePage({
    title: "LLM Wiki",
    body,
    tags: ["imported"],
    related: [],
    sources: ["llm-wiki.md"],
    created: "2026-09-11",
    updated: "2026-09-11",
  });
  assert.match(page, /^---\n/);
  assert.match(page, /\ntype: source\n/);
  assert.ok(page.includes("## The core idea"));
  assert.ok(page.includes("## Architecture"));
  assert.equal((page.match(/^## /gm) ?? []).length, 2);
});

test("oneLineSummary strips a heading marker", () => {
  assert.equal(oneLineSummary("# LLM Wiki\n\nBody"), "LLM Wiki");
});

test("updatePageTags preserves body and unrelated frontmatter", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-tags-"));
  try {
    await fs.mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
    await fs.writeFile(
      path.join(root, "wiki", "concepts", "tags.md"),
      "---\ntype: concept\ntitle: Tags\nrelated:\n  - other\ncustom: keep\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n\n# Body\n\nKeep this.\n",
    );
    const engine = createEngine({ apiBaseUrl: "", apiKey: "", model: "", mock: true });
    const page = await engine.updatePageTags(root, "concepts/tags", [" one ", "", "one", "two"]);
    assert.deepEqual(page.tags, ["one", "two"]);
    assert.match(page.body, /# Body/);
    assert.match(page.raw, /custom: keep/);
    assert.match(page.raw, /related:\n  - other/);
    engine.close?.(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readSource resolves source identity only inside raw/sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-source-"));
  try {
    await fs.mkdir(path.join(root, "wiki", "sources"), { recursive: true });
    await fs.mkdir(path.join(root, "raw", "sources", "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "raw", "sources", "nested", "paper.pdf"), Buffer.from("pdf"));
    await fs.writeFile(
      path.join(root, "wiki", "sources", "paper.md"),
      buildSourcePage({ title: "Paper", body: "# Paper\n", tags: [], related: [], sources: ["nested/paper.pdf"], created: "2026-01-01", updated: "2026-01-01" }),
    );
    const engine = createEngine({ apiBaseUrl: "", apiKey: "", model: "", mock: true });
    const source = await engine.readSource(root, "sources/paper");
    assert.deepEqual(source && { name: source.name, type: source.type, bytes: source.bytes }, { name: "paper.pdf", type: "pdf", bytes: Buffer.from("pdf").toString("base64") });
    await fs.writeFile(path.join(root, "wiki", "sources", "bad.md"), buildSourcePage({ title: "Bad", body: "", tags: [], related: [], sources: ["../outside.pdf"], created: "2026-01-01", updated: "2026-01-01" }));
    assert.equal(await engine.readSource(root, "sources/bad"), null);
    engine.close?.(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
