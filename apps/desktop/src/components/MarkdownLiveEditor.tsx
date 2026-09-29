import { useCallback, useEffect, useMemo, useRef } from "react";
import { Compartment } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { Idea, IdeaSelector, IdeaTarget, PageSummary } from "../api";
import { createCodemirrorTheme } from "../lib/markdown/codemirrorTheme";
import {
  liveEditingZoneHighlight,
  livePreviewEmptyDocHint,
  livePreviewInteractionMode,
  livePreviewMoveVertically,
  livePreviewPlugin,
  livePreviewPointerHandler,
  livePreviewRestoreOnBlur,
  livePreviewSurfaceCapture,
  livePreviewTailPlaceholder,
  stabilizePreviewScroll,
  wikilinkClickHandler,
} from "../lib/markdown/livePreviewPlugin";
import { setLivePreviewActive } from "../lib/markdown/livePreviewState";
import { ideaMarksPlugin } from "../lib/markdown/ideaMarksPlugin";
import { wikilinkAutocomplete } from "../lib/markdown/wikilinkCompletion";
import { selectorFromOffsets } from "../lib/ideaAnchors";
import { IdeaOverlay } from "./IdeaOverlay";

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

export function MarkdownLiveEditor({
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
}: MarkdownLiveEditorProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const viewRef = useRef<EditorView | null>(null);
  const livePreviewCompartment = useRef(new Compartment()).current;
  const ideaMarksCompartment = useRef(new Compartment()).current;

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
      createCodemirrorTheme(),
      stabilizePreviewScroll(),
      livePreviewInteractionMode(),
      livePreviewRestoreOnBlur(),
      liveEditingZoneHighlight(),
      livePreviewEmptyDocHint(),
      livePreviewTailPlaceholder(),
      livePreviewSurfaceCapture(),
      livePreviewCompartment.of(livePreviewPlugin(renderCtx)),
      ideaMarksCompartment.of(ideaMarksPlugin(ideas)),
      wikilinkAutocomplete(pages),
      livePreviewPointerHandler(),
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
    [ideaMarksCompartment, ideas, livePreviewCompartment, onLink, onOpen, onSave, pages, renderCtx], // initial compartment config
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
}
