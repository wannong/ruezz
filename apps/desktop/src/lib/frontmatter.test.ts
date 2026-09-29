import assert from "node:assert/strict";
import { test } from "node:test";
import { joinFrontmatter, splitFrontmatter } from "./frontmatter.ts";

test("splits and joins yaml blocks", () => {
    const raw = "---\ntitle: Test\n---\n\n# Hello\n";
    const parts = splitFrontmatter(raw);
    assert.equal(parts.frontmatter, "---\ntitle: Test\n---\n");
    assert.equal(parts.body, "\n# Hello\n");
    assert.equal(joinFrontmatter(parts.frontmatter, parts.body), raw);
});

test("passes through body-only markdown", () => {
    const raw = "# Title\n";
    const parts = splitFrontmatter(raw);
    assert.equal(parts.frontmatter, null);
    assert.equal(parts.body, raw);
    assert.equal(joinFrontmatter(null, parts.body), raw);
});
