import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { docToMarkdown, renderBlockForCompare } from "../lib/markdown/docToMd.ts";
import { markdownToDoc } from "../lib/markdown/mdToDoc.ts";
import type { MarkdownOrigin, PMNode } from "../lib/markdown/pmTypes.ts";
import { createWysiwygExtensions } from "../lib/markdown/wysiwygExtensions.ts";
import { PasteHandler } from "../lib/markdown/pasteExtension.ts";
import { WikilinkDecoration } from "../lib/markdown/wikilinkDecoration.ts";
import { WikilinkSuggestion } from "../lib/markdown/wikilinkSuggestion.ts";
import { IdeaMarks } from "../lib/markdown/ideaMarks.ts";
import { pickAndSaveImage } from "../lib/markdown/noteAssets.ts";
import type { Idea, PageSummary } from "../api";
import type { WysiwygEditorApi } from "../lib/markdown/editorApi.ts";

type MarkdownWysiwygEditorProps = {
  body: string;
  onBodyChange: (body: string) => void;
  onSave?: () => void;
  onOpen: (id: string) => void;
  pagePath?: string;
  /** Page list backing the `[[` completion menu. */
  pages?: PageSummary[];
  /** Open Ideas are tinted in place while editing. */
  ideas?: Idea[];
  placeholder?: string;
  readOnly?: boolean;
  /** Surfaced to the user when a paste or asset write fails. */
  onError?: (message: string) => void;
  /** Fires when the caret or selection moves, for toolbar state. */
  onSelectionChange?: () => void;
  apiRef?: (api: WysiwygEditorApi | null) => void;
};

const DEBOUNCE_MS = 250;

/**
 * Word-like WYSIWYG surface: the ProseMirror doc is the source of truth while
 * editing, and Markdown is produced only when the note needs saving.
 */
export const MarkdownWysiwygEditor = forwardRef<WysiwygEditorApi, MarkdownWysiwygEditorProps>(
  function MarkdownWysiwygEditor(
    { body, onBodyChange, onSave, onOpen, pagePath, pages = [], ideas = [], placeholder, readOnly, onError, onSelectionChange, apiRef },
    ref,
  ) {
    const originRef = useRef<MarkdownOrigin | null>(null);
    const lastEmittedRef = useRef(body);
    const debounceRef = useRef<number | undefined>(undefined);
    const savedCallbackRef = useRef(onSave);
    savedCallbackRef.current = onSave;
    const changeRef = useRef(onBodyChange);
    changeRef.current = onBodyChange;
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const ideasRef = useRef<Idea[]>(ideas);
    ideasRef.current = ideas;

    const initial = useMemo(() => {
      const { doc, origin } = markdownToDoc(body);
      origin.snapshots = (doc.content ?? []).map(renderBlockForCompare);
      return { doc, origin };
    }, []);
    originRef.current = initial.origin;

    const extensions = useMemo(
      () => [
        ...createWysiwygExtensions({ placeholder }),
        WikilinkDecoration.configure({ onOpen }),
        WikilinkSuggestion.configure({ getPages: () => pagesRef.current }),
        IdeaMarks.configure({ getIdeas: () => ideasRef.current }),
        PasteHandler.configure({
          getContext: () => ({ pagePath, onError }),
        }),
      ],
      [onError, onOpen, pagePath, placeholder],
    );

    const editor = useEditor({
      immediatelyRender: false,
      editable: !readOnly,
      extensions,
      content: initial.doc as never,
      editorProps: {
        attributes: {
          class: "md-body md-wysiwyg-content",
          spellcheck: "false",
        },
      },
      onUpdate({ editor: instance }) {
        scheduleEmit(instance);
      },
      onSelectionUpdate() {
        onSelectionChange?.();
      },
      onTransaction({ editor: instance }) {
        if (instance.isEditable) syncEmptyClass(instance);
      },
    });

    const emit = useCallback((instance: Editor) => {
      const json = instance.getJSON() as unknown as PMNode;
      const origin = originRef.current ?? undefined;
      const markdown = docToMarkdown(json, origin);
      if (markdown === lastEmittedRef.current) return;
      lastEmittedRef.current = markdown;
      changeRef.current(markdown);
    }, []);

    const flush = useCallback(() => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      if (editor) emit(editor);
    }, [editor, emit]);

    const scheduleEmit = useCallback(
      (instance: Editor) => {
        if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          debounceRef.current = undefined;
          emit(instance);
        }, DEBOUNCE_MS);
      },
      [emit],
    );

    useEffect(() => {
      return () => {
        if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      };
    }, []);

    useEffect(() => {
      if (!editor || !readOnly) return;
      editor.setEditable(!readOnly);
    }, [editor, readOnly]);

    const run = useCallback(
      (action: (instance: Editor) => void) => {
        if (!editor) return;
        editor.chain().focus();
        action(editor);
      },
      [editor],
    );

    const currentMarkdown = useCallback((): string => {
      const json = editor?.getJSON() as unknown as PMNode | undefined;
      if (!json) return lastEmittedRef.current;
      return docToMarkdown(json, originRef.current ?? undefined);
    }, [editor]);

    const api = useMemo<WysiwygEditorApi>(
      () => ({
        editor: () => editor,
        isReady: () => Boolean(editor),
        focus: () => editor?.commands.focus(),
        getMarkdown: currentMarkdown,
        undo: () => run((instance) => instance.commands.undo()),
        redo: () => run((instance) => instance.commands.redo()),
        toggleBold: () => run((instance) => instance.chain().focus().toggleBold().run()),
        toggleItalic: () => run((instance) => instance.chain().focus().toggleItalic().run()),
        toggleUnderline: () => run((instance) => instance.chain().focus().toggleUnderline().run()),
        toggleStrike: () => run((instance) => instance.chain().focus().toggleStrike().run()),
        toggleCode: () => run((instance) => instance.chain().focus().toggleCode().run()),
        toggleSubscript: () => run((instance) => instance.chain().focus().toggleSubscript().run()),
        toggleSuperscript: () => run((instance) => instance.chain().focus().toggleSuperscript().run()),
        setHeading: (level) =>
          run((instance) =>
            level === 0
              ? instance.chain().focus().setParagraph().run()
              : instance.chain().focus().setHeading({ level }).run(),
          ),
        toggleBulletList: () => run((instance) => instance.chain().focus().toggleBulletList().run()),
        toggleOrderedList: () => run((instance) => instance.chain().focus().toggleOrderedList().run()),
        toggleTaskList: () => run((instance) => instance.chain().focus().toggleTaskList().run()),
        toggleBlockquote: () => run((instance) => instance.chain().focus().toggleBlockquote().run()),
        toggleCodeBlock: () => run((instance) => instance.chain().focus().toggleCodeBlock().run()),
        setAlign: (align) => run((instance) => instance.chain().focus().setTextAlign(align).run()),
        indent: () => run((instance) => instance.chain().focus().sinkListItem("listItem").run()),
        outdent: () => run((instance) => instance.chain().focus().liftListItem("listItem").run()),
        setColor: (color) =>
          run((instance) =>
            color ? instance.chain().focus().setColor(color).run() : instance.chain().focus().unsetColor().run(),
          ),
        setHighlight: (color) =>
          run((instance) =>
            color
              ? instance.chain().focus().setHighlight({ color }).run()
              : instance.chain().focus().unsetHighlight().run(),
          ),
        setFontSize: (size) =>
          run((instance) =>
            size ? instance.chain().focus().setFontSize(size).run() : instance.chain().focus().unsetFontSize().run(),
          ),
        clearFormat: () =>
          run((instance) =>
            instance.chain().focus().unsetAllMarks().clearNodes().run(),
          ),
        insertTable: () =>
          run((instance) =>
            instance.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
          ),
        insertImage: async () => {
          if (!editor) return;
          const name = await pickAndSaveImage(pagePath);
          if (!name) return;
          editor.chain().focus().setImage({ src: name, alt: name.replace(/\.[^.]+$/, "") }).run();
        },
        insertLink: (href) => run((instance) => instance.chain().focus().extendMarkRange("link").setLink({ href }).run()),
        insertWikilink: (target, label) => {
          if (!editor) return;
          const text = label ?? target;
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text,
              marks: [{ type: "textStyle", attrs: { wikilink: target, ...(text !== target ? { wikilinkLabel: text } : {}) } }],
            })
            .run();
        },
        insertBlockMath: () =>
          run((instance) =>
            instance
              .chain()
              .focus()
              .insertBlockMath({ latex: "E = mc^2" })
              .run(),
          ),
        insertInlineMath: () =>
          run((instance) => instance.chain().focus().insertInlineMath({ latex: "x^2" }).run()),
        selectionOffsets: (): { start: number; end: number; text: string } | null => {
          if (!editor) return null;
          const { from, to, empty } = editor.state.selection;
          if (empty) return null;
          const text = editor.state.doc.textBetween(from, to, "\n", "\n");
          if (!text.trim()) return null;
          const markdown: string = currentMarkdown();
          const start: number = markdown.indexOf(text);
          if (start < 0) return null;
          return { start, end: start + text.length, text };
        },
        wrapSelectionAsWikilink: (target) => {
          if (!editor) return false;
          const { from, to, empty } = editor.state.selection;
          const label = empty ? target : editor.state.doc.textBetween(from, to, " ");
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: label,
              marks: [{ type: "textStyle", attrs: { wikilink: target, ...(label !== target ? { wikilinkLabel: label } : {}) } }],
            })
            .run();
          return true;
        },
      }),
      [currentMarkdown, editor, pagePath, run],
    );

    useImperativeHandle(ref, () => api, [api]);
    useEffect(() => {
      apiRef?.(api);
      return () => apiRef?.(null);
    }, [api, apiRef]);

    const handleSave = useCallback(() => {
      flush();
      savedCallbackRef.current?.();
    }, [flush]);

    const onKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          handleSave();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          const selection = api.selectionOffsets();
          if (selection && editor) {
            const anchorPos = editor.state.selection.from;
            window.dispatchEvent(new CustomEvent("ruezz:link-request", { detail: selection }));
            editor.chain().focus().setTextSelection({ from: anchorPos, to: anchorPos }).run();
          }
        }
      },
      [api, editor, handleSave],
    );

    return (
      <div className="note-wysiwyg" onKeyDown={onKeyDown}>
        <EditorContent editor={editor} className="note-wysiwyg-surface" />
      </div>
    );
  },
);

function syncEmptyClass(editor: Editor): void {
  const dom = editor.view.dom;
  const empty = editor.state.doc.childCount === 1 && editor.state.doc.firstChild?.content.size === 0;
  dom.classList.toggle("is-empty", empty);
}
