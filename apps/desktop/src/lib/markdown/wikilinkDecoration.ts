import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

const wikiKey = new PluginKey("wikilinkDecoration");

/** Style every text run carrying the wikilink attribute as an in-app link. */
function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const link = node.marks.find((mark) => mark.type.name === "textStyle" && mark.attrs.wikilink);
    if (!link) return;
    decorations.push(
      Decoration.inline(pos, pos + node.nodeSize, {
        class: "pm-wikilink",
        "data-wikilink": String(link.attrs.wikilink),
        title: String(link.attrs.wikilink),
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export const WikilinkDecoration = Extension.create({
  name: "wikilinkDecoration",
  addOptions() {
    return { onOpen: undefined as ((id: string) => void) | undefined };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: wikiKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? buildDecorations(tr.doc) : previous),
        },
        props: {
          decorations(state) {
            return wikiKey.getState(state) ?? null;
          },
          handleClick(_view, _pos, event) {
            const target = (event.target as HTMLElement | null)?.closest("[data-wikilink]") as HTMLElement | null;
            if (!target) return false;
            const id = target.dataset.wikilink;
            if (!id || !options.onOpen) return false;
            if (!(event.ctrlKey || event.metaKey)) return false;
            event.preventDefault();
            options.onOpen(id);
            return true;
          },
          handleDOMEvents: {
            dblclick(_view, event) {
              const target = (event.target as HTMLElement | null)?.closest("[data-wikilink]") as HTMLElement | null;
              const id = target?.dataset.wikilink;
              if (!id || !options.onOpen) return false;
              event.preventDefault();
              options.onOpen(id);
              return true;
            },
          },
        },
      }),
    ];
  },
});
