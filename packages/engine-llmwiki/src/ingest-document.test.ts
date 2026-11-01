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

test("markdown files are ingested into the literature library", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-md-"));
  try {
    const source = path.join(root, "notes.md");
    await fs.writeFile(source, "# 我的笔记\n\n正文第一段。\n\n## 小节\n\n更多内容。\n");
    const engine = createEngine({ apiBaseUrl: "", apiKey: "", model: "", mock: true });
    const result = await engine.ingestFile(root, source);
    assert.equal(result.pageIds.length, 1, "one literature page per document");
    const page = await engine.readPage(root, result.pageIds[0]);
    assert.ok(page, "page should be readable");
    assert.equal(page.type, "source");
    // The original is archived, and the page keeps the full document unsplit.
    assert.ok(result.sourcePath?.endsWith(".md"), `sourcePath: ${result.sourcePath}`);
    assert.match(page.body, /正文第一段/);
    assert.match(page.body, /## 小节/);
    // A Markdown original is renderable metadata we can report to the UI.
    assert.equal(page.sourceType, "md");
    engine.close?.(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plain text, csv and html originals are accepted as literature", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wikihome-formats-"));
  try {
    const engine = createEngine({ apiBaseUrl: "", apiKey: "", model: "", mock: true });
    const cases: Array<[string, string]> = [
      ["note.txt", "纯文本正文\n"],
      ["table.csv", "a,b\n1,2\n"],
      ["page.html", "<h1>标题</h1><p>正文</p>\n"],
    ];
    for (const [name, content] of cases) {
      const file = path.join(root, name);
      await fs.writeFile(file, content);
      const result = await engine.ingestFile(root, file);
      assert.equal(result.pageIds.length, 1, `${name} should import`);
      const page = await engine.readPage(root, result.pageIds[0]);
      assert.equal(page?.type, "source", `${name} should be a literature page`);
    }
    engine.close?.(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
