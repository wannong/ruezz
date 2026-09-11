import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourcePage, oneLineSummary, titleFromMarkdown } from "./ingest-document.js";

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
