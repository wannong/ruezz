import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Idea } from "../../api";
import type { MarkdownRenderContext } from "./renderMarkdown";
import { renderMarkdownToHtmlSync } from "./renderMarkdown";
import { injectIdeaMarksIntoRenderedBlock } from "./ideaMarksInPreview";
import {
  EMPTY_EDITABLE_RANGE,
  livePreviewActiveChanged,
  livePreviewActiveField,
  POINTER_USER_EVENT,
  setLivePreviewActive,
} from "./livePreviewState";
import { focusBlankArea, handleBlankPointer, handleRenderedPointer } from "./previewPointer";

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
    return wrap;
  }

  ignoreEvent(event: Event) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".wikilink")) return false;
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
  if (blocks.length > 0) {
    return {
      from: Math.min(...blocks.map((block) => block.from)),
      to: Math.max(...blocks.map((block) => block.to)),
    };
  }
  return { from, to };
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
  if (!expandLines) return blockAtHead(state);
  return expandedSourceRange(state);
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

function shouldExpandLines(tr: Transaction): boolean {
  if (tr.docChanged) return true;
  if (tr.isUserEvent(POINTER_USER_EVENT)) return false;
  return true;
}

function shouldKeepSource(state: EditorState, node: Span, expandLines: boolean): boolean {
  return rangesOverlap(node, editableSourceRange(state, expandLines));
}

function buildDecorations(state: EditorState, ctx: LivePreviewContext, expandLines: boolean): DecorationSet {
  ensureSyntaxTree(state, state.doc.length, 30);
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(state);
  if (!tree.length) return Decoration.none;

  const blocks: BlockSpan[] = [];
  tree.iterate({
    enter: (node) => {
      if (!BLOCK_NODES.has(node.name) || node.name === "ListItem") return;
      blocks.push({ from: node.from, to: node.to, name: node.name });
    },
  });

  const docText = state.doc.toString();
  const ideas = ctx.ideas ?? [];
  const ideasKey = ideas.map((idea) => `${idea.id}:${idea.status}:${idea.updatedAt}`).join("|");

  try {
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
    return builder.finish();
  } catch {
    return Decoration.none;
  }
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

class TailPlaceholderWidget extends WidgetType {
  ignoreEvent() {
    return true;
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-live-tail-placeholder";
    el.textContent = "点击输入…";
    return el;
  }
}

function buildTailPlaceholder(state: EditorState): DecorationSet {
  if (state.doc.toString().trim().length === 0) return Decoration.none;
  const widget = new TailPlaceholderWidget();
  return Decoration.set([
    Decoration.widget({
      widget,
      block: true,
      side: 1,
    }).range(state.doc.length),
  ]);
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
        tr.startState.field(livePreviewActiveField) !== tr.state.field(livePreviewActiveField)
      ) {
        return buildEditingLineDecorations(tr.state, shouldExpandLines(tr));
      }
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** Placeholder below existing content for click-to-continue writing. */
export function livePreviewTailPlaceholder(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTailPlaceholder(state);
    },
    update(deco, tr) {
      if (tr.docChanged) return buildTailPlaceholder(tr.state);
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** Global preview vs block-edit mode (class on editor root + state field). */
export function livePreviewInteractionMode(): Extension {
  return [
    livePreviewActiveField,
    ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {
          this.sync(view);
        }

        update(update: ViewUpdate) {
          if (
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

/** Capture clicks on tail placeholder widgets before CM swallows them. */
export function livePreviewSurfaceCapture(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly onMouseDown: (event: MouseEvent) => void;

      constructor(private readonly view: EditorView) {
        this.onMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement | null;
          if (!target?.closest(".cm-live-tail-placeholder")) return;
          event.preventDefault();
          event.stopPropagation();
          focusBlankArea(this.view);
        };
        this.view.scrollDOM.addEventListener("mousedown", this.onMouseDown, true);
      }

      destroy() {
        this.view.scrollDOM.removeEventListener("mousedown", this.onMouseDown, true);
      }
    },
  );
}

/** Empty-document hint via editor root class. */
export function livePreviewEmptyDocHint(): Extension {
  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        this.sync(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.sync(update.view);
      }

      private sync(view: EditorView) {
        const empty = view.state.doc.toString().trim().length === 0;
        view.dom.classList.toggle("cm-live-empty-doc", empty);
      }
    },
  );
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
        tr.startState.field(livePreviewActiveField) !== tr.state.field(livePreviewActiveField)
      ) {
        return buildDecorations(tr.state, ctx, shouldExpandLines(tr));
      }
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
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
          view.dispatch({ effects: setLivePreviewActive.of(false) });
        });
      }
    },
  );
}

/** Click / double-click a rendered preview block to edit that block. */
export function livePreviewPointerHandler(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || event.detail >= 2) return false;
      if (handleRenderedPointer(event, view, false)) return true;
      if (handleBlankPointer(event, view)) return true;

      // Editor may keep focus but caret is gone — collapse when click is not on the source block.
      if (!view.state.field(livePreviewActiveField)) return false;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".cm-live-editing-line")) return false;
      view.dispatch({ effects: setLivePreviewActive.of(false) });
      return false;
    },
    dblclick(event, view) {
      return handleRenderedPointer(event, view, true);
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
        if (update.docChanged) {
          const head = update.state.selection.main.head;
          const coords = view.coordsAtPos(head);
          if (coords) {
            this.anchorPos = head;
            this.anchorY = coords.top;
          }
        }

        if (!update.docChanged || !update.geometryChanged) return;
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
