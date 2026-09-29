import { RangeSetBuilder, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { Idea } from "../../api";
import { editableSourceRange } from "./livePreviewPlugin";
import { livePreviewActiveChanged, livePreviewActiveField } from "./livePreviewState";
import { resolveIdeaOffset } from "./ideaMarksInPreview";

function rangesOverlap(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to;
}

function buildIdeaMarks(state: EditorState, ideas: Idea[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = state.doc.toString();
  const editable = editableSourceRange(state, true);
  const spans: Array<{ start: number; end: number; idea: Idea }> = [];
  for (const idea of ideas) {
    if (idea.status === "resolved" || idea.selector.kind === "pdf-region") continue;
    const start = resolveIdeaOffset(text, idea.selector);
    if (start == null) continue;
    const end = start + idea.selector.exact.length;
    // Marks on replaced preview blocks break caret mapping — only highlight source text.
    if (!rangesOverlap({ from: start, to: end }, editable)) continue;
    spans.push({ start, end, idea });
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  try {
    for (const span of spans) {
      builder.add(
        span.start,
        span.end,
        Decoration.mark({
          class: `idea-mark-inline idea-mark-${span.idea.color}`,
          attributes: { "data-idea-mark": span.idea.id },
        }),
      );
    }
    return builder.finish();
  } catch {
    return Decoration.none;
  }
}

export function ideaMarksPlugin(ideas: Idea[]) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildIdeaMarks(state, ideas);
    },
    update(deco, tr) {
      if (
        tr.docChanged ||
        !tr.startState.selection.eq(tr.state.selection) ||
        livePreviewActiveChanged(tr) ||
        tr.startState.field(livePreviewActiveField) !== tr.state.field(livePreviewActiveField)
      ) {
        return buildIdeaMarks(tr.state, ideas);
      }
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
