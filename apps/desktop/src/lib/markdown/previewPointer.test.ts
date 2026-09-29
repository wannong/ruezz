import assert from "node:assert/strict";
import { test } from "node:test";
import { mapRenderedOffsetToSource, wordRangeAt } from "./previewPointer.ts";

test("maps heading click offset past markdown hashes", () => {
  const source = "## Hello World\n";
  assert.equal(mapRenderedOffsetToSource(source, "ATXHeading2", 0), 3);
  assert.equal(mapRenderedOffsetToSource(source, "ATXHeading2", 6), 9);
});

test("selects a word inside a heading line", () => {
  const source = "## Hello World";
  assert.deepEqual(wordRangeAt(source, 8), { from: 3, to: 8 });
});
