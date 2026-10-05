import { redo, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { setLivePreviewActive } from "./livePreviewState";

function ensureEditMode(view: EditorView) {
  view.dispatch({ effects: setLivePreviewActive.of(true) });
  view.focus();
}

function wrapSelection(view: EditorView, before: string, after: string) {
  ensureEditMode(view);
  const { from, to } = view.state.selection.main;
  if (from === to) {
    view.dispatch({
      changes: { from, to, insert: `${before}${after}` },
      selection: { anchor: from + before.length },
    });
    return;
  }
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
}

function toggleWrap(view: EditorView, marker: string) {
  ensureEditMode(view);
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const inner = selected.slice(marker.length, -marker.length);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    });
    return;
  }
  wrapSelection(view, marker, marker);
}

function replaceLine(view: EditorView, lineNumber: number, text: string) {
  const line = view.state.doc.line(lineNumber);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: text },
    selection: { anchor: line.from + text.length },
  });
}

function currentLines(view: EditorView): number[] {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from).number;
  const endLine = view.state.doc.lineAt(to).number;
  const lines: number[] = [];
  for (let n = startLine; n <= endLine; n++) lines.push(n);
  return lines;
}

export function formatUndo(view: EditorView): boolean {
  ensureEditMode(view);
  return undo(view);
}

export function formatRedo(view: EditorView): boolean {
  ensureEditMode(view);
  return redo(view);
}

export function formatToggleBold(view: EditorView) {
  toggleWrap(view, "**");
}

export function formatToggleItalic(view: EditorView) {
  toggleWrap(view, "*");
}

export function formatToggleStrikethrough(view: EditorView) {
  toggleWrap(view, "~~");
}

export function formatToggleUnderline(view: EditorView) {
  wrapSelection(view, "<u>", "</u>");
}

export function formatSetHeading(view: EditorView, level: 0 | 1 | 2 | 3) {
  ensureEditMode(view);
  for (const lineNumber of currentLines(view)) {
    const line = view.state.doc.line(lineNumber);
    const stripped = line.text.replace(/^#{1,6}\s+/, "");
    const next = level === 0 ? stripped : `${"#".repeat(level)} ${stripped}`;
    replaceLine(view, lineNumber, next);
  }
}

function toggleLinePrefix(view: EditorView, prefix: string, pattern: RegExp) {
  ensureEditMode(view);
  for (const lineNumber of currentLines(view)) {
    const line = view.state.doc.line(lineNumber);
    const stripped = line.text.replace(pattern, "");
    const next = pattern.test(line.text) ? stripped : `${prefix}${stripped}`;
    replaceLine(view, lineNumber, next);
  }
}

export function formatToggleBulletList(view: EditorView) {
  toggleLinePrefix(view, "- ", /^[-*+]\s+/);
}

export function formatToggleOrderedList(view: EditorView) {
  toggleLinePrefix(view, "1. ", /^\d+\.\s+/);
}

export function formatInsertTable(view: EditorView) {
  ensureEditMode(view);
  const table = ["| 列1 | 列2 |", "| --- | --- |", "|  |  |", ""].join("\n");
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const insert = (line.text.length === 0 ? "" : "\n") + table;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length - 1 },
  });
}

export function formatInsertMarkdown(view: EditorView, markdown: string) {
  ensureEditMode(view);
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: markdown },
    selection: { anchor: from + markdown.length },
  });
}
