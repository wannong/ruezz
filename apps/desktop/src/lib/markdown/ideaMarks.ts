import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Idea } from "../../api";

const ideaKey = new PluginKey("ideaMarks");

/** Resolve an Idea's quoted text to a document range, preferring its saved offset. */
export function findIdeaRange(
  doc: PMNode,
  exact: string,
  preferredOffset: number,
): { from: number; to: number } | null {
  if (!exact) return null;

  // Collect every occurrence of the quoted text in document order.
  const occurrences: Array<{ from: number; to: number; offset: number }> = [];
  let flat = "";
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (let index = 0; index < node.text.length; index += 1) positions.push(pos + index);
    flat += node.text;
  });
  let searchFrom = 0;
  for (;;) {
    const index = flat.indexOf(exact, searchFrom);
    if (index < 0) break;
    const from = positions[index];
    const to = positions[index + exact.length - 1];
    if (from != null && to != null) occurrences.push({ from, to: to + 1, offset: index });
    searchFrom = index + 1;
  }
  if (occurrences.length === 0) return null;
  if (occurrences.length === 1) return { from: occurrences[0].from, to: occurrences[0].to };

  const exactMatch = occurrences.find((item) => item.offset === preferredOffset);
  if (exactMatch) return { from: exactMatch.from, to: exactMatch.to };
  return occurrences
    .slice()
    .sort((a, b) => Math.abs(a.offset - preferredOffset) - Math.abs(b.offset - preferredOffset))
    .map((item) => ({ from: item.from, to: item.to }))[0];
}

function buildDecorations(doc: PMNode, ideas: Idea[]): DecorationSet {
  const decorations: Decoration[] = [];
  for (const idea of ideas) {
    if (idea.status === "resolved") continue;
    if (idea.selector.kind === "pdf-region") continue;
    const range = findIdeaRange(doc, idea.selector.exact, idea.selector.start);
    if (!range) continue;
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: `idea-mark-inline idea-mark-${idea.color}`,
        "data-idea-mark": idea.id,
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

export type IdeaMarksOptions = { getIdeas: () => Idea[] };

/** Tint quoted ranges so existing Ideas stay visible while editing. */
export const IdeaMarks = Extension.create<IdeaMarksOptions>({
  name: "ideaMarks",
  addOptions() {
    return { getIdeas: () => [] };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: ideaKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc, options.getIdeas()),
          apply: (tr, previous) => (tr.docChanged ? buildDecorations(tr.doc, options.getIdeas()) : previous),
        },
        props: {
          decorations(state) {
            return ideaKey.getState(state) ?? null;
          },
        },
      }),
    ];
  },
});
