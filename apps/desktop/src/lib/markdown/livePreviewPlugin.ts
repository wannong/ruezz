import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { RangeSetBuilder, StateField, Transaction, type EditorState, type Extension, type Transaction as EditorTransaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Idea } from "../../api";
import type { MarkdownRenderContext } from "./renderMarkdown";
import { renderMarkdownToHtmlSync } from "./renderMarkdown";
import { injectIdeaMarksIntoRenderedBlock } from "./ideaMarksInPreview";
import {
  EMPTY_EDITABLE_RANGE,
  exitLivePreviewEdit,
  livePreviewActiveChanged,
  livePreviewActiveField,
  livePreviewFocusBlockChanged,
  livePreviewFocusBlockField,
  POINTER_USER_EVENT,
  setLivePreviewActive,
} from "./livePreviewState";
import { disposeRenderedDragSelect, handleBlankDoubleClick, handleRenderedPointer } from "./previewPointer";
import { shouldYieldToPreviewScroll, stopPreviewScrollEventPropagation } from "./previewScrollbar";

export type LivePreviewContext = MarkdownRenderContext & {
  ideas?: Idea[];
};

const BLOCK_NODES = new Set([
  "Paragraph",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "Blockquote",
  "FencedCode",
  "BulletList",
  "OrderedList",
  "ListItem",
  "HorizontalRule",
  "HTMLBlock",
  "CodeBlock",
]);

type Span = { from: number; to: number };

class RenderedBlockWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly blockName: string,
    readonly blockFrom: number,
    readonly blockTo: number,
    readonly ideas: Idea[],
    readonly ideasKey: string,
    readonly docText: string,
  ) {
    super();
  }

  eq(other: RenderedBlockWidget) {
    return (
      other.html === this.html &&
      other.blockName === this.blockName &&
      other.blockFrom === this.blockFrom &&
      other.blockTo === this.blockTo &&
      other.ideasKey === this.ideasKey
    );
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = `cm-live-preview-rendered md-body live-block-${this.blockName.toLowerCase()}`;
    wrap.dataset.blockFrom = String(this.blockFrom);
    wrap.dataset.blockTo = String(this.blockTo);
    wrap.dataset.blockName = this.blockName;
    wrap.innerHTML = this.html;
    if (this.ideas.length > 0) {
      injectIdeaMarksIntoRenderedBlock(wrap, this.ideas, this.blockFrom, this.blockTo, this.docText);
    }
    const shieldScrollPointer = (event: MouseEvent) => {
      stopPreviewScrollEventPropagation(wrap, event);
    };
    wrap.addEventListener("mousedown", shieldScrollPointer, true);
    wrap.addEventListener("click", shieldScrollPointer, true);
    wrap.addEventListener("dblclick", shieldScrollPointer, true);
    return wrap;
  }

  ignoreEvent(event: Event) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".wikilink")) return false;
    if (event instanceof MouseEvent) {
      const rendered = target?.closest(".cm-live-preview-rendered") as HTMLElement | null;
      if (rendered && shouldYieldToPreviewScroll(target, rendered, event.clientX, event.clientY)) {
        return true;
      }
    }
    if (event.type === "mousedown" || event.type === "click" || event.type === "dblclick") return false;
    return true;
  }
}

type BlockSpan = { from: number; to: number; name: string };

function rangesOverlap(a: Span, b: Span): boolean {
  return a.from < b.to && b.from < a.to;
}

function isInnermostBlock(span: BlockSpan, blocks: BlockSpan[]): boolean {
  return !blocks.some(
    (other) =>
      other !== span &&
      span.from <= other.from &&
      span.to >= other.to &&
      (span.from < other.from || span.to > other.to),
  );
}

function inFencedCode(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return true;
    node = node.parent!;
  }
  return false;
}

function blockAtPos(state: EditorState, pos: number): Span {
  ensureSyntaxTree(state, state.doc.length, 30);
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);

  let fenced: Span | null = null;
  let innerBlock: Span | null = null;
  while (node && node.name !== "Document") {
    if (node.name === "FencedCode" || node.name === "CodeBlock") {
      fenced = { from: node.from, to: node.to };
    }
    if (BLOCK_NODES.has(node.name) && node.name !== "ListItem") {
      innerBlock = { from: node.from, to: node.to };
    }
    node = node.parent!;
  }

  if (fenced) return fenced;
  if (innerBlock) return innerBlock;

  const line = state.doc.lineAt(pos);
  return { from: line.from, to: line.to };
}

function blockAtHead(state: EditorState): Span {
  return blockAtPos(state, state.selection.main.head);
}

function lineSpan(state: EditorState, lineNumber: number): Span {
  const line = state.doc.line(lineNumber);
  return { from: line.from, to: line.to };
}

function expandedSourceRange(state: EditorState): Span {
  const head = state.selection.main.head;
  const tree = syntaxTree(state);
  let node = tree.resolveInner(head, 1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") {
      return { from: node.from, to: node.to };
    }
    node = node.parent!;
  }

  const core = blockAtHead(state);
  const cursorLine = state.doc.lineAt(head);
  const fromLineNum = Math.max(1, cursorLine.number - 1);
  const toLineNum = Math.min(state.doc.lines, cursorLine.number + 1);

  let keptFrom = cursorLine.number;
  for (let lineNumber = fromLineNum; lineNumber <= cursorLine.number; lineNumber++) {
    const line = state.doc.line(lineNumber);
    if (lineNumber === cursorLine.number || line.text.trim().length > 0 || rangesOverlap(lineSpan(state, lineNumber), core)) {
      keptFrom = lineNumber;
      break;
    }
  }

  let keptTo = cursorLine.number;
  for (let lineNumber = toLineNum; lineNumber >= cursorLine.number; lineNumber--) {
    const line = state.doc.line(lineNumber);
    if (lineNumber === cursorLine.number || line.text.trim().length > 0 || rangesOverlap(lineSpan(state, lineNumber), core)) {
      keptTo = lineNumber;
      break;
    }
  }

  const from = state.doc.line(keptFrom).from;
  const to = state.doc.line(keptTo).to;
  const blocks = blocksForRange(state, { from, to });
  const range =
    blocks.length > 0
      ? {
          from: Math.min(...blocks.map((block) => block.from)),
          to: Math.max(...blocks.map((block) => block.to)),
        }
      : { from, to };
  return ensureRangeIncludesHead(state, range);
}

function ensureRangeIncludesHead(state: EditorState, range: Span): Span {
  const head = state.selection.main.head;
  if (head >= range.from && head <= range.to) return range;
  const core = blockAtHead(state);
  return {
    from: Math.min(range.from, core.from),
    to: Math.max(range.to, core.to),
  };
}

function blocksForRange(state: EditorState, span: Span): BlockSpan[] {
  ensureSyntaxTree(state, state.doc.length, 30);
  const tree = syntaxTree(state);
  const blocks: BlockSpan[] = [];
  tree.iterate({
    enter: (node) => {
      if (!BLOCK_NODES.has(node.name) || node.name === "ListItem") return;
      const block = { from: node.from, to: node.to, name: node.name };
      if (rangesOverlap(block, span)) blocks.push(block);
    },
  });
  return blocks.filter((block) => isInnermostBlock(block, blocks));
}

/**
 * Blocks that stay markdown source.
 * - Keyboard / Enter: expand to adjacent lines for smoother paragraph editing.
 * - Mouse click: only the clicked block — other source blocks immediately preview.
 */
export function editableSourceRange(state: EditorState, expandLines = true): Span {
  if (!state.field(livePreviewActiveField)) return EMPTY_EDITABLE_RANGE;
  const focusBlock = state.field(livePreviewFocusBlockField);
  if (!expandLines && focusBlock) return ensureRangeIncludesHead(state, focusBlock);
  if (!expandLines) return ensureRangeIncludesHead(state, blockAtHead(state));
  return expandedSourceRange(state);
}

function isDeleteUserEvent(tr: EditorTransaction): boolean {
  const userEvent = tr.annotation(Transaction.userEvent);
  return typeof userEvent === "string" && userEvent.startsWith("delete");
}

/** Move across rendered blocks when ArrowUp/Down would otherwise jump to the document start. */
export function livePreviewMoveVertically(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.head);
  const targetLineNumber = line.number + (forward ? 1 : -1);
  if (targetLineNumber < 1 || targetLineNumber > state.doc.lines) return false;

  const targetLine = state.doc.line(targetLineNumber);
  const editable = editableSourceRange(state, true);
  if (rangesOverlap({ from: targetLine.from, to: targetLine.to }, editable)) return false;

  const column = selection.head - line.from;
  const block = blockAtPos(state, forward ? targetLine.from : targetLine.to);
  const anchorLine = forward ? state.doc.lineAt(block.from) : state.doc.lineAt(block.to);
  const newPos = forward
    ? Math.min(block.from + column, block.to)
    : Math.min(block.to, Math.max(block.from, anchorLine.from + column));

  view.dispatch({
    effects: setLivePreviewActive.of(true),
    selection: { anchor: newPos, head: newPos },
    scrollIntoView: true,
    userEvent: "select.keyboard",
  });
  return true;
}

function shouldExpandLines(tr: EditorTransaction): boolean {
  if (tr.isUserEvent(POINTER_USER_EVENT)) {
    const start = tr.startState.selection.main;
    const end = tr.state.selection.main;
    return !start.empty || !end.empty;
  }
  if (tr.isUserEvent("select.correction")) return false;
  if (tr.docChanged && isDeleteUserEvent(tr)) return false;
  if (tr.docChanged) return true;
  return true;
}

function shouldKeepSource(state: EditorState, node: Span, expandLines: boolean): boolean {
  if (!state.field(livePreviewActiveField)) return false;
  const { from, to } = state.selection.main;
  const selFrom = Math.min(from, to);
  const selTo = Math.max(from, to);
  if (rangesOverlap(node, { from: selFrom, to: selTo })) return true;
  return rangesOverlap(node, editableSourceRange(state, expandLines));
}

function isHeadInPreviewWidget(view: EditorView, head = view.state.selection.main.head): boolean {
  const coords = view.coordsAtPos(head);
  if (!coords) return true;
  const dom = view.domAtPos(head);
  const element = dom.node instanceof Element ? dom.node : dom.node.parentElement;
  return Boolean(element?.closest(".cm-live-preview-rendered"));
}

function isHeadOnVisibleSourceLine(view: EditorView, head = view.state.selection.main.head): boolean {
  if (isHeadInPreviewWidget(view, head)) return false;
  const coords = view.coordsAtPos(head);
  if (!coords) return false;
  const dom = view.domAtPos(head);
  const element = dom.node instanceof Element ? dom.node : dom.node.parentElement;
  return Boolean(element?.closest(".cm-line"));
}

function snapHeadToEditablePos(state: EditorState, head: number): number {
  const range = editableSourceRange(state, true);
  if (range.from > range.to) return head;
  if (head >= range.from && head <= range.to) {
    const line = state.doc.lineAt(head);
    return Math.max(line.from, Math.min(head, line.to));
  }
  const distToFrom = Math.abs(head - range.from);
  const distToTo = Math.abs(head - range.to);
  return distToFrom <= distToTo ? range.from : range.to;
}

function pruneAdjacentAbandonedBlankLines(view: EditorView): void {
  const state = view.state;
  const headLine = state.doc.lineAt(state.selection.main.head);
  const editable = editableSourceRange(state, false);
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (const lineNumber of [headLine.number - 1, headLine.number + 1]) {
    if (lineNumber < 1 || lineNumber > state.doc.lines) continue;
    const line = state.doc.line(lineNumber);
    if (line.text.trim().length > 0) continue;
    if (rangesOverlap({ from: line.from, to: line.to }, editable)) continue;
    if (line.number < state.doc.lines) {
      changes.push({ from: line.from, to: line.to + 1, insert: "" });
    } else if (line.from > 0) {
      changes.push({ from: line.from - 1, to: line.to, insert: "" });
    }
  }

  if (changes.length === 0) return;
  view.dispatch({
    changes,
    userEvent: "delete.preview-prune",
  });
}

function buildSelectionHighlight(state: EditorState): DecorationSet {
  if (!state.field(livePreviewActiveField)) return Decoration.none;
  const { from, to } = state.selection.main;
  if (from === to) return Decoration.none;
  const editRange = editableSourceRange(state, shouldExpandLinesForState(state));
  if (editRange.from > editRange.to) return Decoration.none;
  const selFrom = Math.max(Math.min(from, to), editRange.from);
  const selTo = Math.min(Math.max(from, to), editRange.to);
  if (selFrom >= selTo) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  builder.add(selFrom, selTo, Decoration.mark({ class: "cm-live-selection-highlight" }));
  return builder.finish();
}

function shouldExpandLinesForState(state: EditorState): boolean {
  const { from, to } = state.selection.main;
  return from !== to;
}

function correctCursorIfHidden(view: EditorView): void {
  if (!view.state.field(livePreviewActiveField)) return;
  const head = view.state.selection.main.head;
  if (!isHeadInPreviewWidget(view, head)) return;
  const safe = snapHeadToEditablePos(view.state, head);
  if (safe === head) return;
  view.dispatch({
    selection: { anchor: safe, head: safe },
    scrollIntoView: true,
    userEvent: "select.correction",
  });
}

function buildDecorations(
  state: EditorState,
  ctx: LivePreviewContext,
  expandLines: boolean,
): DecorationSet {
  ensureSyntaxTree(state, state.doc.length, 200);
  if (!syntaxTreeAvailable(state, state.doc.length)) {
    ensureSyntaxTree(state, state.doc.length, 1000);
  }

  const builder = new RangeSetBuilder<Decoration>();
  const docText = state.doc.toString();
  const ideas = ctx.ideas ?? [];
  const ideasKey = ideas.map((idea) => `${idea.id}:${idea.status}:${idea.updatedAt}`).join("|");

  if (syntaxTreeAvailable(state, state.doc.length)) {
    const tree = syntaxTree(state);
    const blocks: BlockSpan[] = [];
    tree.iterate({
      enter: (node) => {
        if (!BLOCK_NODES.has(node.name) || node.name === "ListItem") return;
        blocks.push({ from: node.from, to: node.to, name: node.name });
      },
    });

    for (const node of blocks) {
      if (!isInnermostBlock(node, blocks)) continue;
      if (shouldKeepSource(state, node, expandLines)) continue;
      const text = state.doc.sliceString(node.from, node.to);
      if (!text.trim()) continue;
      if (inFencedCode(state, node.from)) continue;
      let html: string;
      try {
        html = renderMarkdownToHtmlSync(text, ctx);
      } catch {
        continue;
      }
      const widget = new RenderedBlockWidget(html, node.name, node.from, node.to, ideas, ideasKey, docText);
      builder.add(
        node.from,
        node.to,
        Decoration.replace({
          widget,
          block: true,
          inclusive: true,
        }),
      );
    }
  }

  return builder.finish();
}

function buildEditingLineDecorations(state: EditorState, expandLines: boolean): DecorationSet {
  const range = editableSourceRange(state, expandLines);
  if (range.from > range.to) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const fromLine = state.doc.lineAt(range.from);
  const toLine = state.doc.lineAt(range.to);
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    let className = "cm-live-editing-line";
    if (lineNumber === fromLine.number) className += " cm-live-editing-line-first";
    if (lineNumber === toLine.number) className += " cm-live-editing-line-last";
    builder.add(line.from, line.from, Decoration.line({ class: className }));
  }
  return builder.finish();
}

/** Highlight only the current editable block (source lines). */
export function liveEditingZoneHighlight(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildEditingLineDecorations(state, true);
    },
    update(deco, tr) {
      if (
        tr.docChanged ||
        !tr.startState.selection.eq(tr.state.selection) ||
        livePreviewActiveChanged(tr) ||
        livePreviewFocusBlockChanged(tr) ||
        tr.startState.field(livePreviewActiveField) !== tr.state.field(livePreviewActiveField) ||
        tr.startState.field(livePreviewFocusBlockField) !== tr.state.field(livePreviewFocusBlockField)
      ) {
        return buildEditingLineDecorations(tr.state, shouldExpandLines(tr));
      }
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** Global preview vs block-edit mode (class on editor root + state field). */
export function livePreviewInteractionMode(): Extension {
  return [
    livePreviewActiveField,
    livePreviewFocusBlockField,
    ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {
          this.sync(view);
        }

        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.focusChanged ||
            update.startState.field(livePreviewActiveField) !== update.state.field(livePreviewActiveField)
          ) {
            this.sync(update.view);
          }
        }

        private sync(view: EditorView) {
          const preview = !view.state.field(livePreviewActiveField);
          view.dom.classList.toggle("cm-live-global-preview", preview);
        }
      },
    ),
  ];
}

/** Visible selection tint on source lines in block-edit mode (CM selection layer is easy to miss). */
export function livePreviewSelectionHighlight(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildSelectionHighlight(state);
    },
    update(deco, tr) {
      if (!tr.state.field(livePreviewActiveField)) return Decoration.none;
      if (
        !tr.startState.selection.eq(tr.state.selection) ||
        tr.docChanged ||
        livePreviewActiveChanged(tr) ||
        livePreviewFocusBlockChanged(tr) ||
        tr.startState.field(livePreviewFocusBlockField) !== tr.state.field(livePreviewFocusBlockField)
      ) {
        return buildSelectionHighlight(tr.state);
      }
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** Block replace decorations must use StateField — ViewPlugin cannot provide them. */
export function livePreviewPlugin(ctx: LivePreviewContext) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, ctx, true);
    },
    update(deco, tr) {
      if (
        tr.docChanged ||
        !tr.startState.selection.eq(tr.state.selection) ||
        livePreviewActiveChanged(tr) ||
        livePreviewFocusBlockChanged(tr) ||
        tr.startState.field(livePreviewActiveField) !== tr.state.field(livePreviewActiveField) ||
        tr.startState.field(livePreviewFocusBlockField) !== tr.state.field(livePreviewFocusBlockField)
      ) {
        return buildDecorations(tr.state, ctx, shouldExpandLines(tr));
      }
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** After delete, prune abandoned blank expansion lines and keep the caret on source text. */
export function livePreviewEditHygiene(): Extension {
  return ViewPlugin.fromClass(
    class {
      private scheduled = false;

      update(update: ViewUpdate) {
        if (!update.state.field(livePreviewActiveField)) return;
        const needsHygiene =
          update.docChanged ||
          update.geometryChanged ||
          update.selectionSet ||
          update.transactions.some((tr) => isDeleteUserEvent(tr));
        if (!needsHygiene || this.scheduled) return;
        this.scheduled = true;
        const view = update.view;
        const hadDelete = update.transactions.some((tr) => tr.docChanged && isDeleteUserEvent(tr));
        requestAnimationFrame(() => {
          this.scheduled = false;
          if (!view.state.field(livePreviewActiveField)) return;
          if (hadDelete) pruneAdjacentAbandonedBlankLines(view);
          correctCursorIfHidden(view);
        });
      }
    },
  );
}

/**
 * When the editor loses focus the caret disappears — treat that as leaving edit mode
 * and restore global preview. Deferred one frame so preview-block clicks can refocus first.
 */
export function livePreviewRestoreOnBlur(): Extension {
  return ViewPlugin.fromClass(
    class {
      private pending = false;

      update(update: ViewUpdate) {
        if (!update.focusChanged || update.view.hasFocus) return;
        if (!update.state.field(livePreviewActiveField)) return;
        if (this.pending) return;
        this.pending = true;
        const view = update.view;
        requestAnimationFrame(() => {
          this.pending = false;
          if (view.hasFocus || !view.state.field(livePreviewActiveField)) return;
          exitLivePreviewEdit(view);
        });
      }
    },
  );
}

/** Tear down preview-block drag listeners when the editor unmounts. */
export function livePreviewDragSelectCleanup(): Extension {
  return ViewPlugin.define(() => ({
    destroy() {
      disposeRenderedDragSelect();
    },
  }));
}

/** Click / double-click a rendered preview block to edit that block. */
export function livePreviewPointerHandler(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || event.detail >= 2) return false;
      if (handleRenderedPointer(event, view, false)) return true;

      // Editor may keep focus but caret is gone — collapse when click is not on the source block.
      if (!view.state.field(livePreviewActiveField)) return false;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".cm-live-editing-line")) return false;
      if (target?.closest(".cm-live-preview-rendered")) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
      exitLivePreviewEdit(view, pos ?? undefined);
      return false;
    },
    dblclick(event, view) {
      if (handleRenderedPointer(event, view, true)) return true;
      return handleBlankDoubleClick(event, view);
    },
  });
}

export function wikilinkClickHandler(onOpen: (id: string) => void) {
  return EditorView.domEventHandlers({
    click(event, view) {
      const target = (event.target as HTMLElement | null)?.closest("[data-wikilink]") as HTMLElement | null;
      if (!target) return false;
      const id = decodeURIComponent(target.dataset.wikilink ?? "");
      if (!id) return false;
      event.preventDefault();
      onOpen(id);
      view.focus();
      return true;
    },
  });
}

/** Reduce viewport jump when Enter expands/shrinks preview blocks. */
export function stabilizePreviewScroll(): Extension {
  return ViewPlugin.fromClass(
    class {
      private anchorPos = -1;
      private anchorY = 0;

      update(update: ViewUpdate) {
        const view = update.view;
        const deleteChange = update.transactions.some((tr) => tr.docChanged && isDeleteUserEvent(tr));
        const head = update.state.selection.main.head;
        if (!isHeadOnVisibleSourceLine(view, head)) {
          this.anchorPos = -1;
        } else if (update.docChanged && !deleteChange) {
          const coords = view.coordsAtPos(head);
          if (coords) {
            this.anchorPos = head;
            this.anchorY = coords.top;
          }
        }

        if (!update.docChanged || !update.geometryChanged || deleteChange) return;
        if (this.anchorPos < 0) return;

        requestAnimationFrame(() => {
          const coords = view.coordsAtPos(this.anchorPos);
          if (!coords) return;
          const delta = coords.top - this.anchorY;
          if (Math.abs(delta) < 1) return;
          view.scrollDOM.scrollTop += delta;
          this.anchorY = coords.top;
        });
      }
    },
  );
}
