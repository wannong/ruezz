import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatWikiSchemaForPrompt,
  isDefaultPurposeTemplate,
  loadBundledWikiSchema,
} from "./wiki-schema.js";

test("loadBundledWikiSchema returns Ruezz schema markdown", () => {
  const schema = loadBundledWikiSchema();
  assert.match(schema, /Ruezz Wiki 维护规范/);
  assert.match(schema, /wiki\/sources\//);
  assert.match(schema, /复利原则/);
});

test("isDefaultPurposeTemplate detects scaffold purpose.md", () => {
  const scaffold = `# Purpose

Describe the goal, key questions, and scope of this wiki. The maintainer reads
this on every ingest and query, so it shapes what gets emphasized.

## Key questions
- ...

## Scope
- ...
`;
  assert.equal(isDefaultPurposeTemplate(scaffold), true);
  assert.equal(
    isDefaultPurposeTemplate("# Purpose\n\n研究里德堡原子微波测量。\n\n## Key questions\n- 灵敏度极限？\n"),
    false,
  );
});

test("formatWikiSchemaForPrompt appends customized vault purpose", () => {
  const out = formatWikiSchemaForPrompt("BASE", "# Purpose\n\n里德堡原子实验笔记。");
  assert.match(out, /Wiki 维护规范/);
  assert.match(out, /本库目标/);
  assert.match(out, /里德堡原子实验笔记/);
});
