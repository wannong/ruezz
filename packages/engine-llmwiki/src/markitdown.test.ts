import assert from "node:assert/strict";
import { test } from "node:test";
import { pythonCandidates } from "./markitdown.js";

test("pythonCandidates prefers WIKIHOME_PYTHON", () => {
  const prev = process.env.WIKIHOME_PYTHON;
  process.env.WIKIHOME_PYTHON = "D:\\wikihome-test-python.exe";
  try {
    const bins = pythonCandidates();
    assert.equal(bins[0], "D:\\wikihome-test-python.exe");
    assert.ok(bins.length >= 2);
  } finally {
    if (prev === undefined) delete process.env.WIKIHOME_PYTHON;
    else process.env.WIKIHOME_PYTHON = prev;
  }
});
