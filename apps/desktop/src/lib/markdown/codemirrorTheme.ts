import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export function createCodemirrorTheme(): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--ink)",
      fontSize: "0.95rem",
      lineHeight: "1.65",
    },
    ".cm-scroller": {
      backgroundColor: "transparent",
    },
    ".cm-content": {
      fontFamily: "var(--font-ui)",
      padding: "0.85rem 0",
      caretColor: "var(--ink)",
      backgroundColor: "transparent",
    },
    ".cm-line": {
      padding: "0 1rem",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 32%, transparent) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--ink)",
      zIndex: "4",
    },
    ".cm-live-preview-rendered": {
      display: "block",
      pointerEvents: "auto",
    },
    ".cm-live-preview-rendered .wikilink": {
      pointerEvents: "auto",
    },
  });
}
