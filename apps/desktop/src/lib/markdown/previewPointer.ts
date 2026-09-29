import type { EditorView } from "@codemirror/view";
import { POINTER_USER_EVENT, setLivePreviewActive } from "./livePreviewState";

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

export function focusRenderedBlock(
  view: EditorView,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
  selectWord: boolean,
): void {
  const blockFrom = Number(rendered.dataset.blockFrom);
  const blockTo = Number(rendered.dataset.blockTo);
  if (!Number.isFinite(blockFrom) || !Number.isFinite(blockTo)) return;

  const blockName = rendered.dataset.blockName ?? "";
  const blockSource = view.state.doc.sliceString(blockFrom, blockTo);
  const renderedOffset = caretOffsetInElement(rendered, clientX, clientY);

  const applySelection = (pos: number) => {
    const clamped = Math.max(blockFrom, Math.min(pos, blockTo));
    if (selectWord) {
      const local = Math.max(0, Math.min(clamped - blockFrom, blockSource.length));
      const word = wordRangeAt(blockSource, local);
      view.dispatch({
        effects: setLivePreviewActive.of(true),
        selection: { anchor: blockFrom + word.from, head: blockFrom + word.to },
        scrollIntoView: true,
        userEvent: POINTER_USER_EVENT,
      });
    } else {
      view.dispatch({
        effects: setLivePreviewActive.of(true),
        selection: { anchor: clamped, head: clamped },
        scrollIntoView: true,
        userEvent: POINTER_USER_EVENT,
      });
    }
    view.focus();
  };

  view.dispatch({
    effects: setLivePreviewActive.of(true),
    selection: { anchor: blockFrom, head: blockFrom },
    scrollIntoView: false,
    userEvent: POINTER_USER_EVENT,
  });

  if (renderedOffset != null && isHeadingBlock(blockName)) {
    applySelection(blockFrom + mapRenderedOffsetToSource(blockSource, blockName, renderedOffset));
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const hit = view.posAtCoords({ x: clientX, y: clientY }, false);
      if (hit != null && hit >= blockFrom && hit <= blockTo) {
        applySelection(hit);
        return;
      }
      if (renderedOffset != null) {
        applySelection(blockFrom + mapRenderedOffsetToSource(blockSource, blockName, renderedOffset));
        return;
      }
      applySelection(blockFrom);
    });
  });
}

export function handleRenderedPointer(event: MouseEvent, view: EditorView, selectWord: boolean): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".wikilink")) return false;
  const rendered = target?.closest(".cm-live-preview-rendered") as HTMLElement | null;
  if (!rendered) return false;

  event.preventDefault();
  event.stopPropagation();
  focusRenderedBlock(view, rendered, event.clientX, event.clientY, selectWord);
  return true;
}

export function focusBlankArea(view: EditorView): void {
  const { state } = view;
  const doc = state.doc;
  let pos = doc.length;
  const changes: Array<{ from: number; insert: string }> = [];

  if (doc.length === 0) {
    pos = 0;
  } else {
    const lastLine = doc.line(doc.lines);
    if (lastLine.text.trim().length === 0) {
      pos = lastLine.from;
    } else {
      const suffix = doc.toString().endsWith("\n") ? "\n" : "\n\n";
      changes.push({ from: doc.length, insert: suffix });
      pos = doc.length + suffix.length;
    }
  }

  view.dispatch({
    effects: setLivePreviewActive.of(true),
    changes: changes.length > 0 ? changes : undefined,
    selection: { anchor: pos, head: pos },
    scrollIntoView: true,
    userEvent: POINTER_USER_EVENT,
  });
  view.focus();
}

export function handleBlankPointer(event: MouseEvent, view: EditorView): boolean {
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(".cm-live-preview-rendered") || target.closest(".wikilink")) return false;
  if (!view.dom.contains(target)) return false;

  if (target.closest(".cm-live-tail-placeholder")) {
    event.preventDefault();
    event.stopPropagation();
    focusBlankArea(view);
    return true;
  }

  if (view.state.doc.toString().trim().length === 0) {
    if (target.closest(".cm-content") || target.closest(".cm-scroller") || target.closest(".cm-editor")) {
      event.preventDefault();
      event.stopPropagation();
      focusBlankArea(view);
      return true;
    }
  }

  const content = view.contentDOM;
  const lastBlock = view.lineBlockAt(view.state.doc.length);
  const belowContent = event.clientY > lastBlock.bottom + 2;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
  const hitChrome = target === view.scrollDOM || target === content;

  if (pos != null && !belowContent) return false;
  if (!belowContent && !hitChrome) return false;

  event.preventDefault();
  event.stopPropagation();
  focusBlankArea(view);
  return true;
}
