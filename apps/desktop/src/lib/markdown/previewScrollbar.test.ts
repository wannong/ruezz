import assert from "node:assert/strict";
import { test } from "node:test";
import { isPointerOnScrollbar, shouldYieldToPreviewScroll } from "./previewScrollbar.ts";

function mockScrollableEl(options: {
  left: number;
  top: number;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  offsetWidth?: number;
  offsetHeight?: number;
  overflowX?: string;
  overflowY?: string;
}): HTMLElement {
  const offsetWidth = options.offsetWidth ?? options.width;
  const offsetHeight = options.offsetHeight ?? options.height;
  return {
    scrollWidth: options.scrollWidth,
    scrollHeight: options.scrollHeight,
    clientWidth: options.clientWidth,
    clientHeight: options.clientHeight,
    offsetWidth,
    offsetHeight,
    children: [] as HTMLCollection,
    getBoundingClientRect: () => ({
      left: options.left,
      top: options.top,
      width: options.width,
      height: options.height,
      right: options.left + options.width,
      bottom: options.top + options.height,
    }),
    parentElement: null,
    contains: () => true,
  } as HTMLElement;
}

test("detects horizontal scrollbar track at the bottom edge", () => {
  const el = mockScrollableEl({
    left: 10,
    top: 20,
    width: 200,
    height: 100,
    clientWidth: 183,
    clientHeight: 83,
    offsetWidth: 200,
    offsetHeight: 100,
    scrollWidth: 400,
    scrollHeight: 80,
    overflowX: "auto",
    overflowY: "visible",
  });
  assert.equal(isPointerOnScrollbar(el, 120, 115), true);
  assert.equal(isPointerOnScrollbar(el, 120, 90), false);
});

test("yields scroll for the whole preview block near the horizontal track", () => {
  const rendered = mockScrollableEl({
    left: 0,
    top: 0,
    width: 300,
    height: 120,
    clientWidth: 300,
    clientHeight: 104,
    offsetWidth: 300,
    offsetHeight: 120,
    scrollWidth: 620,
    scrollHeight: 100,
    overflowX: "auto",
    overflowY: "visible",
  });
  assert.equal(shouldYieldToPreviewScroll(rendered, rendered, 150, 112), true);
  assert.equal(shouldYieldToPreviewScroll(rendered, rendered, 150, 60), false);
});
