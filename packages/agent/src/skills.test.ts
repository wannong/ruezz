import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  loadBundledSkills,
  parseSkillMarkdown,
  selectSkillsForMessage,
} from "./skills.js";
import { resolveInsideVault } from "./tools/vault-path.js";

const SAMPLE = `---
name: grill-me
description: >-
  User-invoked interview.
disable-model-invocation: true
---

Call grilling.
`;

test("parseSkillMarkdown reads folded description and disable flag", () => {
  const skill = parseSkillMarkdown(SAMPLE, "grill-me");
  assert.equal(skill.name, "grill-me");
  assert.equal(skill.description, "User-invoked interview.");
  assert.equal(skill.disableModelInvocation, true);
  assert.equal(skill.body, "Call grilling.");
});

test("loadBundledSkills finds grill-me, grilling, and markitdown", () => {
  const names = loadBundledSkills().map((skill) => skill.name);
  assert.deepEqual(names, ["grill-me", "grilling", "markitdown"]);
});

test("selectSkillsForMessage activates grill-me only when asked", () => {
  const skills = loadBundledSkills();
  const asked = selectSkillsForMessage("用 grill-me 把入库方案问清楚", skills).map((s) => s.name);
  assert.deepEqual(asked, ["grill-me", "grilling"]);
  const ordinary = selectSkillsForMessage("什么是 attention？", skills);
  assert.deepEqual(ordinary, []);
});

test("selectSkillsForMessage activates markitdown for PDF conversion", () => {
  const skills = loadBundledSkills();
  const names = selectSkillsForMessage("把 raw/sources/paper.pdf 转成 markdown", skills).map(
    (s) => s.name,
  );
  assert.deepEqual(names, ["markitdown"]);
});

test("resolveInsideVault rejects path traversal", () => {
  const root = path.resolve("/tmp/wikihome-vault");
  assert.throws(() => resolveInsideVault(root, "../secret.txt"));
});
