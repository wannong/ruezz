import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import type { PageSummary } from "../../api";

export type WikilinkItem = { id: string; title: string };

const wikilinkPluginKey = new PluginKey("wikilinkSuggestion");

/** Pages matching what the user has typed after `[[`. */
export function wikilinkMatches(pages: PageSummary[], query: string, limit = 12): WikilinkItem[] {
  const needle = query.trim().toLowerCase();
  const items = pages.map((page) => ({ id: page.id, title: page.title ?? page.id }));
  if (!needle) return items.slice(0, limit);
  const scored = items
    .map((item) => {
      const id = item.id.toLowerCase();
      const title = item.title.toLowerCase();
      let score = -1;
      if (title.startsWith(needle)) score = 0;
      else if (id.startsWith(needle)) score = 1;
      else if (title.includes(needle)) score = 2;
      else if (id.includes(needle)) score = 3;
      return { item, score };
    })
    .filter((row) => row.score >= 0)
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title));
  return scored.slice(0, limit).map((row) => row.item);
}

function buildPopup(): { element: HTMLElement; render: (items: WikilinkItem[], active: number, pick: (item: WikilinkItem) => void) => void; hide: () => void; destroy: () => void } {
  const element = document.createElement("div");
  element.className = "wikilink-menu";
  element.style.display = "none";

  const render = (items: WikilinkItem[], active: number, pick: (item: WikilinkItem) => void) => {
    element.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "wikilink-menu-empty";
      empty.textContent = "没有匹配的页面";
      element.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `wikilink-menu-item${index === active ? " is-active" : ""}`;
      button.textContent = item.title;
      if (item.title !== item.id) {
        const detail = document.createElement("small");
        detail.textContent = item.id;
        button.append(detail);
      }
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        pick(item);
      });
      element.append(button);
    });
  };

  return {
    element,
    render,
    hide: () => {
      element.style.display = "none";
    },
    destroy: () => element.remove(),
  };
}

/** Place the popup under the caret, flipping above it near the viewport bottom. */
function positionPopup(element: HTMLElement, editor: Editor, range: Range): void {
  const start = editor.view.coordsAtPos(range.from);
  const end = editor.view.coordsAtPos(range.to);
  element.style.display = "block";
  const height = element.offsetHeight;
  const below = start.bottom + height + 8 < window.innerHeight;
  element.style.position = "fixed";
  element.style.left = `${Math.min(window.innerWidth - element.offsetWidth - 8, Math.max(8, start.left))}px`;
  element.style.top = below ? `${start.bottom + 4}px` : `${Math.max(8, start.top - height - 4)}px`;
  void end;
}

export type WikilinkSuggestionOptions = {
  getPages: () => PageSummary[];
  onPick?: (id: string) => void;
};

/**
 * Type `[[` to link another page. Mirrors the completion that used to live in the
 * CodeMirror source editor, now backed by the live page list.
 */
export const WikilinkSuggestion = Extension.create<WikilinkSuggestionOptions>({
  name: "wikilinkSuggestion",
  addOptions() {
    return { getPages: () => [] };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    const popup = buildPopup();
    let items: WikilinkItem[] = [];
    let active = 0;
    let current: { range: Range; command: (item: WikilinkItem) => void } | null = null;

    const editor = this.editor;
    const suggestion: SuggestionOptions<WikilinkItem> = {
      editor,
      pluginKey: wikilinkPluginKey,
      char: "[[",
      allowSpaces: true,
      startOfLine: false,
      items: ({ query }) => wikilinkMatches(options.getPages(), query),
      render: () => ({
        onStart(props) {
          current = { range: props.range, command: props.command };
          items = props.items;
          active = 0;
          document.body.append(popup.element);
          popup.render(items, active, (item) => props.command(item));
          positionPopup(popup.element, props.editor, props.range);
        },
        onUpdate(props) {
          current = { range: props.range, command: props.command };
          items = props.items;
          if (active >= items.length) active = 0;
          popup.render(items, active, (item) => props.command(item));
          positionPopup(popup.element, props.editor, props.range);
        },
        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup.hide();
            return true;
          }
          if (props.event.key === "ArrowDown") {
            active = (active + 1) % Math.max(1, items.length);
            popup.render(items, active, (item) => current?.command(item));
            return true;
          }
          if (props.event.key === "ArrowUp") {
            active = (active - 1 + items.length) % Math.max(1, items.length);
            popup.render(items, active, (item) => current?.command(item));
            return true;
          }
          if (props.event.key === "Enter") {
            const item = items[active];
            if (item && current) current.command(item);
            return true;
          }
          return false;
        },
        onExit() {
          popup.hide();
          popup.element.remove();
        },
      }),
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: WikilinkItem }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "text",
            text: props.title,
            marks: [
              {
                type: "textStyle",
                attrs: { wikilink: props.id, ...(props.title !== props.id ? { wikilinkLabel: props.title } : {}) },
              },
            ],
          })
          .run();
        options.onPick?.(props.id);
      },
    };

    return [Suggestion(suggestion)];
  },
});
