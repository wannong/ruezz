import type { Editor } from "@tiptap/core";

export type AlignValue = "left" | "center" | "right" | "justify";

/** Everything the toolbar and note shell need from the editor instance. */
export type WysiwygEditorApi = {
  editor: () => Editor | null;
  isReady: () => boolean;
  focus: () => void;
  /** Serialize the current doc; used right before saving. */
  getMarkdown: () => string;
  undo: () => void;
  redo: () => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleCode: () => void;
  toggleSubscript: () => void;
  toggleSuperscript: () => void;
  setHeading: (level: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleTaskList: () => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  setAlign: (align: AlignValue) => void;
  indent: () => void;
  outdent: () => void;
  setColor: (color: string | null) => void;
  setHighlight: (color: string | null) => void;
  setFontSize: (size: string | null) => void;
  clearFormat: () => void;
  insertTable: () => void;
  insertImage: () => Promise<void>;
  insertLink: (href: string) => void;
  insertWikilink: (target: string, label?: string) => void;
  insertBlockMath: () => void;
  insertInlineMath: () => void;
  /** Plain-text selection range in the serialized markdown, for Idea anchors. */
  selectionOffsets: () => { start: number; end: number; text: string } | null;
  /** Replace the current selection with a wikilink, keeping the label. */
  wrapSelectionAsWikilink: (target: string) => boolean;
};
