import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Compartment } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import { drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { Idea, IdeaSelector, IdeaTarget, PageSummary } from "../api";
import { createCodemirrorTheme } from "../lib/markdown/codemirrorTheme";
import {
  formatInsertTable,
  formatRedo,
  formatSetHeading,
  formatToggleBold,
  formatToggleBulletList,
  formatToggleItalic,
  formatToggleOrderedList,
  formatToggleStrikethrough,
  formatToggleUnderline,
  formatUndo,
} from "../lib/markdown/formatCommands";
import { pickAndInsertNoteImage } from "../lib/markdown/insertNoteImage";
import {
  liveEditingZoneHighlight,
  livePreviewEditHygiene,
  livePreviewInteractionMode,
  livePreviewMoveVertically,
  livePreviewPlugin,
  livePreviewDragSelectCleanup,
  livePreviewPointerHandler,
  livePreviewRestoreOnBlur,
  livePreviewSelectionHighlight,
  stabilizePreviewScroll,
  wikilinkClickHandler,
} from "../lib/markdown/livePreviewPlugin";
import { setLivePreviewActive } from "../lib/markdown/livePreviewState";
import { ideaMarksPlugin } from "../lib/markdown/ideaMarksPlugin";
import { wikilinkAutocomplete } from "../lib/markdown/wikilinkCompletion";
import { selectorFromOffsets } from "../lib/ideaAnchors";
import { IdeaOverlay } from "./IdeaOverlay";

export type MarkdownLiveEditorApi = {
  isReady: () => boolean;
  undo: () => void;
  redo: () => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikethrough: () => void;
  setHeading: (level: 0 | 1 | 2 | 3) => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  insertTable: () => void;
  insertImage: () => Promise<void>;
};

type MarkdownLiveEditorProps = {
  body: string;
  onBodyChange: (body: string) => void;
  onSave?: () => void;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  assetRoot?: string;
  basePath?: string;
  ideaTarget?: IdeaTarget;
  ideas?: Idea[];
  ideasVisible?: boolean;
  onIdeasVisible?: (visible: boolean) => void;
  onCreateIdea?: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea?: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onAddToChat?: (text: string) => void;
  onLink?: (range: { start: number; end: number }) => void;
  editorKey?: string;
};

export const MarkdownLiveEditor = forwardRef<MarkdownLiveEditorApi, MarkdownLiveEditorProps>(function MarkdownLiveEditor(
  {
    body,
    onBodyChange,
    onSave,
    pages,
    onOpen,
    assetRoot,
    basePath,
    ideaTarget,
    ideas = [],
    ideasVisible = true,
    onIdeasVisible,
    onCreateIdea,
    onUpdateIdea,
    onAddToChat,
    onLink,
    editorKey,
  },
  ref,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const viewRef = useRef<EditorView | null>(null);
  const livePreviewCompartment = useRef(new Compartment()).current;
  const ideaMarksCompartment = useRef(new Compartment()).current;

  const withView = useCallback((fn: (view: EditorView) => void) => {
    const view = viewRef.current ?? editorRef.current?.view ?? null;
    if (!view) return;
    fn(view);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => viewRef.current != null,
      undo: () => withView((view) => formatUndo(view)),
      redo: () => withView((view) => formatRedo(view)),
      toggleBold: () => withView((view) => formatToggleBold(view)),
      toggleItalic: () => withView((view) => formatToggleItalic(view)),
      toggleUnderline: () => withView((view) => formatToggleUnderline(view)),
      toggleStrikethrough: () => withView((view) => formatToggleStrikethrough(view)),
      setHeading: (level) => withView((view) => formatSetHeading(view, level)),
      toggleBulletList: () => withView((view) => formatToggleBulletList(view)),
      toggleOrderedList: () => withView((view) => formatToggleOrderedList(view)),
      insertTable: () => withView((view) => formatInsertTable(view)),
      insertImage: async () => {
        const view = viewRef.current ?? editorRef.current?.view ?? null;
        if (!view) return;
        await pickAndInsertNoteImage(view, assetRoot, basePath);
      },
    }),
    [assetRoot, basePath, withView],
  );

  const renderCtx = useMemo(
    () => ({ pages, onOpen, assetRoot, basePath, ideas }),
    [pages, onOpen, assetRoot, basePath, ideas],
  );
  const ideasKey = useMemo(
    () => ideas.map((idea) => `${idea.id}:${idea.status}:${idea.updatedAt}`).join("|"),
    [ideas],
  );

  const captureCmSelection = useCallback((clientX: number, clientY: number, isContextMenu: boolean) => {
    const view = viewRef.current ?? editorRef.current?.view ?? null;
    if (!view) return null;
    const { from, to } = view.state.selection.main;
    if (from === to && !isContextMenu) return null;
    const text = view.state.doc.toString();
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const selector = selectorFromOffsets(text, start, end);
    if (!selector) return null;
    return { selector, x: clientX, y: clientY };
  }, []);

  const extensions = useMemo(
    () => [
      markdown(),
      history(),
      drawSelection(),
      createCodemirrorTheme(),
      stabilizePreviewScroll(),
      livePreviewInteractionMode(),
      livePreviewRestoreOnBlur(),
      livePreviewEditHygiene(),
      liveEditingZoneHighlight(),
      livePreviewCompartment.of(livePreviewPlugin(renderCtx)),
      ideaMarksCompartment.of(ideaMarksPlugin(ideas)),
      wikilinkAutocomplete(pages),
      livePreviewPointerHandler(),
      livePreviewSelectionHighlight(),
      livePreviewDragSelectCleanup(),
      wikilinkClickHandler(onOpen),
      keymap.of([
        {
          key: "ArrowUp",
          run: (view) => livePreviewMoveVertically(view, false),
        },
        {
          key: "ArrowDown",
          run: (view) => livePreviewMoveVertically(view, true),
        },
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: "Mod-s",
          run: () => {
            onSave?.();
            return true;
          },
        },
        {
          key: "Mod-k",
          run: (view) => {
            const { from, to } = view.state.selection.main;
            onLink?.({ start: from, end: to });
            return true;
          },
        },
      ]),
    ],
    [ideaMarksCompartment, ideas, livePreviewCompartment, onLink, onOpen, onSave, pages, renderCtx],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        livePreviewCompartment.reconfigure(livePreviewPlugin(renderCtx)),
        ideaMarksCompartment.reconfigure(ideaMarksPlugin(ideas)),
      ],
    });
  }, [ideas, ideasKey, ideaMarksCompartment, livePreviewCompartment, renderCtx]);

  return (
    <IdeaOverlay
      className="note-live-editor"
      surfaceRef={surfaceRef}
      ideaTarget={ideaTarget}
      ideas={ideas}
      ideasVisible={ideasVisible}
      onIdeasVisible={onIdeasVisible}
      onCreateIdea={onCreateIdea}
      onUpdateIdea={onUpdateIdea}
      onAddToChat={onAddToChat}
      contentKey={body}
      captureSelection={captureCmSelection}
      onLinkRange={(range) => onLink?.(range)}
      linkLabel="链接"
    >
      <CodeMirror
        key={editorKey}
        ref={editorRef}
        className="cm-markdown-live"
        theme="none"
        value={body}
        height="100%"
        extensions={extensions}
        basicSetup={{ lineNumbers: false, foldGutter: false }}
        onChange={onBodyChange}
        onCreateEditor={(view) => {
          viewRef.current = view;
          view.dispatch({ effects: setLivePreviewActive.of(false) });
        }}
      />
    </IdeaOverlay>
  );
});
