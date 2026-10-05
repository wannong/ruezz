import type { EditorView } from "@codemirror/view";
import {
  livePreviewActiveField,
  livePreviewFocusBlockField,
  POINTER_USER_EVENT,
  setLivePreviewActive,
  setLivePreviewFocusBlock,
} from "./livePreviewState";

export { POINTER_USER_EVENT };

export function caretOffsetInElement(root: HTMLElement, clientX: number, clientY: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let range = doc.caretRangeFromPoint?.(clientX, clientY) ?? null;
  if (!range) {
    const position = doc.caretPositionFromPoint?.(clientX, clientY);
    if (!position) return null;
    range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  }
  if (!root.contains(range.startContainer)) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === range.startContainer) {
      return offset + range.startOffset;
    }
    offset += node.data.length;
  }
  return null;
}

export function wordRangeAt(text: string, pos: number): { from: number; to: number } {
  let from = Math.max(0, Math.min(pos, text.length));
  let to = from;
  while (from > 0 && !/\s/u.test(text[from - 1])) from -= 1;
  while (to < text.length && !/\s/u.test(text[to])) to += 1;
  return { from, to };
}

/** Map a click offset in rendered plain text to an offset inside the markdown source block. */
export function mapRenderedOffsetToSource(blockSource: string, blockName: string, renderedOffset: number): number {
  const safeOffset = Math.max(0, renderedOffset);
  const trimmed = blockSource.replace(/\n+$/g, "");

  if (blockName.startsWith("ATXHeading")) {
    const match = trimmed.match(/^(#{1,6}\s+)(.*)$/s);
    if (match) {
      const body = match[2].replace(/\s+$/g, "");
      return match[1].length + Math.min(safeOffset, body.length);
    }
  }

  if (blockName === "SetextHeading1" || blockName === "SetextHeading2") {
    const title = trimmed.split("\n")[0] ?? "";
    return Math.min(safeOffset, title.length);
  }

  return Math.min(safeOffset, trimmed.length);
}

export function isHeadingBlock(blockName: string): boolean {
  return blockName.startsWith("ATXHeading") || blockName.startsWith("SetextHeading");
}

type RenderedBlockMeta = {
  blockFrom: number;
  blockTo: number;
  blockName: string;
  blockSource: string;
};

function readRenderedBlockMeta(rendered: HTMLElement, view: EditorView): RenderedBlockMeta | null {
  const blockFrom = Number(rendered.dataset.blockFrom);
  const blockTo = Number(rendered.dataset.blockTo);
  if (!Number.isFinite(blockFrom) || !Number.isFinite(blockTo)) return null;
  const blockName = rendered.dataset.blockName ?? "";
  const blockSource = view.state.doc.sliceString(blockFrom, blockTo);
  return { blockFrom, blockTo, blockName, blockSource };
}

function renderedTextLines(root: HTMLElement): string[] {
  return root.innerText.replace(/\r\n/g, "\n").split("\n");
}

function flatRenderedOffsetToLineCol(lines: string[], flatOffset: number): { line: number; col: number } {
  let remaining = Math.max(0, flatOffset);
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length;
    if (remaining <= len) return { line: i, col: remaining };
    remaining -= len + 1;
  }
  const last = Math.max(0, lines.length - 1);
  return { line: last, col: lines[last]?.length ?? 0 };
}

function sourceLineStartOffset(sourceLines: string[], lineIndex: number): number {
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) offset += sourceLines[i].length + 1;
  return offset;
}

/** Map a click inside a rendered preview block to a local offset in the markdown source block. */
export function mapRenderedPointerToSource(
  blockSource: string,
  blockName: string,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const trimmed = blockSource.replace(/\n+$/g, "");
  const sourceLines = trimmed.length > 0 ? trimmed.split("\n") : [""];

  if (isHeadingBlock(blockName) || sourceLines.length === 1) {
    const renderedOffset = caretOffsetInElement(rendered, clientX, clientY) ?? 0;
    return mapRenderedOffsetToSource(blockSource, blockName, renderedOffset);
  }

  const visualLines = renderedTextLines(rendered);
  const visualLineCount = Math.max(visualLines.length, 1);
  const rect = rendered.getBoundingClientRect();
  const relY = Math.max(0, Math.min(clientY - rect.top, Math.max(rect.height - 1, 0)));
  const flatOffset = caretOffsetInElement(rendered, clientX, clientY);

  let visualLineIndex: number;
  let col: number;
  if (flatOffset != null && visualLineCount > 1) {
    const lineCol = flatRenderedOffsetToLineCol(visualLines, flatOffset);
    visualLineIndex = lineCol.line;
    col = lineCol.col;
  } else if (flatOffset != null) {
    visualLineIndex = 0;
    col = flatOffset;
  } else {
    visualLineIndex = Math.min(
      visualLineCount - 1,
      Math.max(0, Math.floor((relY / Math.max(rect.height, 1)) * visualLineCount)),
    );
    col = 0;
  }

  let sourceLineIndex: number;
  if (sourceLines.length > 1 && visualLineCount === 1) {
    sourceLineIndex = Math.min(
      sourceLines.length - 1,
      Math.max(0, Math.floor((relY / Math.max(rect.height, 1)) * sourceLines.length)),
    );
  } else {
    sourceLineIndex = Math.min(
      sourceLines.length - 1,
      Math.round((visualLineIndex / Math.max(visualLineCount - 1, 1)) * (sourceLines.length - 1)),
    );
  }

  const lineText = sourceLines[sourceLineIndex] ?? "";
  col = Math.max(0, Math.min(col, lineText.length));
  return Math.min(sourceLineStartOffset(sourceLines, sourceLineIndex) + col, trimmed.length);
}

function pointerOnRenderedPreview(clientX: number, clientY: number): boolean {
  const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  return Boolean(target?.closest(".cm-live-preview-rendered"));
}

function scrollbarGutter(el: HTMLElement): { x: number; y: number } {
  return {
    x: Math.max(0, el.offsetWidth - el.clientWidth),
    y: Math.max(0, el.offsetHeight - el.clientHeight),
  };
}

const OVERLAY_SCROLLBAR_SLOP = 14;

function pointerOnElementScrollbar(el: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const canScrollX = el.scrollWidth > el.clientWidth;
  const canScrollY = el.scrollHeight > el.clientHeight;
  if (!canScrollX && !canScrollY) return false;

  const gutter = scrollbarGutter(el);
  const onHorizontalClassic = canScrollX && gutter.y > 0 && y >= el.clientHeight;
  const onHorizontalOverlay =
    canScrollX &&
    gutter.y === 0 &&
    y >= el.clientHeight - Math.min(OVERLAY_SCROLLBAR_SLOP, el.clientHeight);
  const onVerticalClassic = canScrollY && gutter.x > 0 && x >= el.clientWidth;
  const onVerticalOverlay =
    canScrollY &&
    gutter.x === 0 &&
    x >= el.clientWidth - Math.min(OVERLAY_SCROLLBAR_SLOP, el.clientWidth);
  return onHorizontalClassic || onHorizontalOverlay || onVerticalClassic || onVerticalOverlay;
}

/** Let native scrollbars inside preview blocks receive pointer events. */
function pointerOnPreviewScrollbar(
  target: HTMLElement | null,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  let el: HTMLElement | null = target;
  while (el) {
    if (pointerOnElementScrollbar(el, clientX, clientY)) return true;
    if (el === rendered) break;
    el = el.parentElement;
    if (el && !rendered.contains(el)) break;
  }
  return false;
}

function resolveBlockPos(
  view: EditorView,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  const meta = readRenderedBlockMeta(rendered, view);
  if (!meta) return null;
  const { blockFrom, blockTo, blockName, blockSource } = meta;

  // Preview widgets paint on top of hidden source lines — posAtCoords often lands one line off.
  if (pointerOnRenderedPreview(clientX, clientY)) {
    return blockFrom + mapRenderedPointerToSource(blockSource, blockName, rendered, clientX, clientY);
  }

  const hit = view.posAtCoords({ x: clientX, y: clientY }, false);
  if (hit != null && hit >= blockFrom && hit <= blockTo) return hit;

  return blockFrom + mapRenderedPointerToSource(blockSource, blockName, rendered, clientX, clientY);
}

type RenderedDragState = {
  view: EditorView;
  rendered: HTMLElement;
  anchor: number;
  blockFrom: number;
  blockTo: number;
  blockName: string;
  blockSource: string;
};

let renderedDrag: RenderedDragState | null = null;

function resolveDragHead(view: EditorView, drag: RenderedDragState, clientX: number, clientY: number): number {
  const hit = view.posAtCoords({ x: clientX, y: clientY }, false);
  if (hit != null) return hit;

  const target = document.elementFromPoint(clientX, clientY);
  const rendered = (target?.closest(".cm-live-preview-rendered") as HTMLElement | null) ?? drag.rendered;
  const pos = resolveBlockPos(view, rendered, clientX, clientY);
  if (pos != null) return pos;

  return drag.anchor;
}

function focusBlockEffects(blockFrom: number, blockTo: number) {
  return [setLivePreviewActive.of(true), setLivePreviewFocusBlock.of({ from: blockFrom, to: blockTo })];
}

function scheduleSourcePointerPlacement(
  view: EditorView,
  blockFrom: number,
  blockTo: number,
  blockSource: string,
  clientX: number,
  clientY: number,
  selectWord: boolean,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!view.state.field(livePreviewActiveField)) return;
      const focus = view.state.field(livePreviewFocusBlockField);
      if (!focus || focus.from !== blockFrom || focus.to !== blockTo) return;
      const hit = view.posAtCoords({ x: clientX, y: clientY }, false);
      if (hit == null || hit < blockFrom || hit > blockTo) return;
      if (selectWord) {
        const local = Math.max(0, Math.min(hit - blockFrom, blockSource.length));
        const word = wordRangeAt(blockSource, local);
        view.dispatch({
          selection: { anchor: blockFrom + word.from, head: blockFrom + word.to },
          scrollIntoView: true,
          userEvent: POINTER_USER_EVENT,
        });
        return;
      }
      view.dispatch({
        selection: { anchor: hit, head: hit },
        scrollIntoView: true,
        userEvent: POINTER_USER_EVENT,
      });
    });
  });
}

function onRenderedDragMove(event: MouseEvent) {
  if (!renderedDrag || event.buttons !== 1) return;
  const { view, anchor } = renderedDrag;
  const head = resolveDragHead(view, renderedDrag, event.clientX, event.clientY);
  const sel = view.state.selection.main;
  if (sel.anchor === anchor && sel.head === head) return;
  view.dispatch({
    effects: focusBlockEffects(renderedDrag.blockFrom, renderedDrag.blockTo),
    selection: { anchor, head },
    scrollIntoView: true,
    userEvent: POINTER_USER_EVENT,
  });
}

function endRenderedDrag() {
  window.removeEventListener("mousemove", onRenderedDragMove);
  window.removeEventListener("mouseup", onRenderedDragEnd);
  renderedDrag = null;
}

function onRenderedDragEnd(event: MouseEvent) {
  const drag = renderedDrag;
  endRenderedDrag();
  if (!drag) return;
  if (!drag.view.state.field(livePreviewActiveField)) return;
  const sel = drag.view.state.selection.main;
  if (!sel.empty) return;
  scheduleSourcePointerPlacement(
    drag.view,
    drag.blockFrom,
    drag.blockTo,
    drag.blockSource,
    event.clientX,
    event.clientY,
    false,
  );
}

/** Clear in-flight drag listeners when the editor is destroyed. */
export function disposeRenderedDragSelect() {
  endRenderedDrag();
}

function beginRenderedDragSelect(event: MouseEvent, view: EditorView, rendered: HTMLElement): void {
  const meta = readRenderedBlockMeta(rendered, view);
  if (!meta) return;

  const { blockFrom, blockTo, blockName, blockSource } = meta;
  const anchor = resolveBlockPos(view, rendered, event.clientX, event.clientY) ?? blockFrom;

  endRenderedDrag();
  renderedDrag = { view, rendered, anchor, blockFrom, blockTo, blockName, blockSource };

  view.dispatch({
    effects: focusBlockEffects(blockFrom, blockTo),
    selection: { anchor, head: anchor },
    scrollIntoView: true,
    userEvent: POINTER_USER_EVENT,
  });
  view.focus();

  window.addEventListener("mousemove", onRenderedDragMove);
  window.addEventListener("mouseup", onRenderedDragEnd);
}

export function focusRenderedBlock(
  view: EditorView,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
  selectWord: boolean,
): void {
  const meta = readRenderedBlockMeta(rendered, view);
  if (!meta) return;
  const { blockFrom, blockTo, blockSource } = meta;

  const applySelection = (pos: number) => {
    const clamped = Math.max(blockFrom, Math.min(pos, blockTo));
    if (selectWord) {
      const local = Math.max(0, Math.min(clamped - blockFrom, blockSource.length));
      const word = wordRangeAt(blockSource, local);
      view.dispatch({
        effects: focusBlockEffects(blockFrom, blockTo),
        selection: { anchor: blockFrom + word.from, head: blockFrom + word.to },
        scrollIntoView: true,
        userEvent: POINTER_USER_EVENT,
      });
    } else {
      view.dispatch({
        effects: focusBlockEffects(blockFrom, blockTo),
        selection: { anchor: clamped, head: clamped },
        scrollIntoView: true,
        userEvent: POINTER_USER_EVENT,
      });
    }
    view.focus();
  };

  const syncPos = resolveBlockPos(view, rendered, clientX, clientY);
  applySelection(syncPos ?? blockFrom);
  scheduleSourcePointerPlacement(view, blockFrom, blockTo, blockSource, clientX, clientY, selectWord);
}

type BlankEditTarget = {
  pos: number;
  blockFrom: number;
  blockTo: number;
  changes?: Array<{ from: number; insert: string }>;
};

function lineBlockCenterY(view: EditorView, lineFrom: number): number {
  const block = view.lineBlockAt(lineFrom);
  return (block.top + block.bottom) / 2;
}

/** Pick the blank line closest to a pointer, or create one near the click. */
export function resolveNearestBlankEditTarget(view: EditorView, clientY: number): BlankEditTarget {
  const doc = view.state.doc;

  if (doc.toString().trim().length === 0) {
    return { pos: 0, blockFrom: 0, blockTo: 0 };
  }

  let bestBlankLine = 0;
  let bestBlankDistance = Infinity;
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (line.text.trim().length > 0) continue;
    const distance = Math.abs(clientY - lineBlockCenterY(view, line.from));
    if (distance < bestBlankDistance) {
      bestBlankDistance = distance;
      bestBlankLine = lineNumber;
    }
  }

  if (bestBlankLine > 0) {
    const line = doc.line(bestBlankLine);
    return { pos: line.from, blockFrom: line.from, blockTo: line.to };
  }

  const lastBlock = view.lineBlockAt(doc.length);
  if (clientY > lastBlock.bottom + 2) {
    const lastLine = doc.line(doc.lines);
    if (lastLine.text.trim().length === 0) {
      return { pos: lastLine.from, blockFrom: lastLine.from, blockTo: lastLine.to };
    }
    const suffix = doc.toString().endsWith("\n") ? "\n" : "\n\n";
    const pos = doc.length + suffix.length;
    return {
      pos,
      blockFrom: doc.length,
      blockTo: pos,
      changes: [{ from: doc.length, insert: suffix }],
    };
  }

  let nearestLine = 1;
  let nearestDistance = Infinity;
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const distance = Math.abs(clientY - lineBlockCenterY(view, line.from));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestLine = lineNumber;
    }
  }

  const line = doc.line(nearestLine);
  const insertAfter = clientY >= lineBlockCenterY(view, line.from);
  const insertAt = insertAfter ? line.to : line.from;
  return {
    pos: insertAt,
    blockFrom: insertAt,
    blockTo: insertAt,
    changes: [{ from: insertAt, insert: "\n" }],
  };
}

/** Double-click a blank area to edit the nearest blank line (no always-on tail widget). */
export function handleBlankDoubleClick(event: MouseEvent, view: EditorView): boolean {
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(".cm-live-preview-rendered") || target.closest(".wikilink")) return false;
  if (target.closest(".cm-live-editing-line")) return false;
  if (!view.dom.contains(target)) return false;

  const doc = view.state.doc;
  const lastBlock = view.lineBlockAt(doc.length);
  const belowContent = event.clientY > lastBlock.bottom + 2;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
  const hitChrome = target === view.scrollDOM || target === view.contentDOM;

  const emptyDoc = doc.toString().trim().length === 0;
  if (!emptyDoc && pos != null && !belowContent && !hitChrome) return false;

  event.preventDefault();
  event.stopPropagation();

  const editTarget = resolveNearestBlankEditTarget(view, event.clientY);
  view.dispatch({
    effects: focusBlockEffects(editTarget.blockFrom, editTarget.blockTo),
    changes: editTarget.changes,
    selection: { anchor: editTarget.pos, head: editTarget.pos },
    scrollIntoView: true,
    userEvent: POINTER_USER_EVENT,
  });
  view.focus();
  return true;
}

export function handleRenderedPointer(event: MouseEvent, view: EditorView, selectWord: boolean): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".wikilink")) return false;
  const rendered = target?.closest(".cm-live-preview-rendered") as HTMLElement | null;
  if (!rendered) return false;
  if (pointerOnPreviewScrollbar(target, rendered, event.clientX, event.clientY)) return false;

  event.preventDefault();
  event.stopPropagation();
  if (selectWord) {
    focusRenderedBlock(view, rendered, event.clientX, event.clientY, true);
  } else {
    beginRenderedDragSelect(event, view, rendered);
  }
  return true;
}
