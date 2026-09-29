import { Check, Eye, EyeOff, StickyNote } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Idea, IdeaSelector, IdeaTarget } from "../api";
import { rangeFromSelector, selectorFromRange } from "../lib/ideaAnchors";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

const AGENT_STICKY_WIDTH = 200;

type MarkRect = { id: string; color: Idea["color"]; left: number; top: number; width: number; height: number };
type StickyPlacement = {
  idea: Idea;
  left: number;
  top: number;
  width: number;
  anchorX: number;
  anchorY: number;
  fixed?: boolean;
  right?: number;
  bottom?: number;
};

type CaptureResult = { selector: IdeaSelector; x: number; y: number };

type IdeaOverlayProps = {
  children: ReactNode;
  className?: string;
  surfaceRef: RefObject<HTMLElement | null>;
  /** DOM root for markdown text anchors (read mode). */
  anchorRootRef?: RefObject<HTMLElement | null>;
  ideaTarget?: IdeaTarget;
  ideas?: Idea[];
  ideasVisible?: boolean;
  onIdeasVisible?: (visible: boolean) => void;
  onCreateIdea?: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea?: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onAddToChat?: (text: string) => void;
  contentKey?: string;
  captureSelection?: (clientX: number, clientY: number, isContextMenu: boolean) => CaptureResult | null;
  onLinkRange?: (range: { start: number; end: number }) => void;
  linkLabel?: string;
};

export function IdeaOverlay({
  children,
  className,
  surfaceRef,
  anchorRootRef,
  ideaTarget,
  ideas = [],
  ideasVisible = true,
  onIdeasVisible,
  onCreateIdea,
  onUpdateIdea,
  onAddToChat,
  contentKey,
  captureSelection,
  onLinkRange,
  linkLabel,
}: IdeaOverlayProps) {
  const [selection, setSelection] = useState<CaptureResult | null>(null);
  const [menu, setMenu] = useState<CaptureResult | null>(null);
  const [composer, setComposer] = useState<CaptureResult | null>(null);
  const [content, setContent] = useState("");
  const [marks, setMarks] = useState<MarkRect[]>([]);
  const [stickies, setStickies] = useState<StickyPlacement[]>([]);
  const [hoveredIdeaId, setHoveredIdeaId] = useState<string | null>(null);
  const hideTimer = useRef<number | null>(null);
  const canAnnotate = Boolean(ideaTarget && (onCreateIdea || onAddToChat || onLinkRange));

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      setMarks([]);
      setStickies([]);
      return;
    }
    const root = anchorRootRef?.current ?? null;

    const placeSticky = (idea: Idea, anchor: DOMRect, surfaceRect: DOMRect, anchored: StickyPlacement[]) => {
      const agentSticky = idea.target.kind === "assistant" || ideaTarget?.kind === "assistant";
      if (agentSticky) {
        anchored.push({
          idea,
          left: 0,
          top: 0,
          width: AGENT_STICKY_WIDTH,
          right: Math.max(0, window.innerWidth - anchor.left),
          bottom: Math.max(0, window.innerHeight - anchor.top),
          anchorX: anchor.left,
          anchorY: anchor.top + anchor.height / 2,
          fixed: true,
        });
        return;
      }
      const noteWidth = Math.min(236, Math.max(184, surfaceRect.width - 16));
      const roomOnRight = surfaceRect.right - anchor.right;
      const placeBeside = roomOnRight >= noteWidth + 20;
      const left = placeBeside
        ? anchor.right - surfaceRect.left + 14
        : Math.max(8, Math.min(anchor.left - surfaceRect.left, surfaceRect.width - noteWidth - 8));
      const anchorTop = anchor.top - surfaceRect.top;
      const top = placeBeside ? anchorTop - 8 : anchorTop + anchor.height + 10;
      anchored.push({
        idea,
        left,
        top,
        width: noteWidth,
        anchorX: anchor.right - surfaceRect.left,
        anchorY: anchor.top - surfaceRect.top + anchor.height / 2,
      });
    };

    const update = () => {
      const surfaceRect = surface.getBoundingClientRect();
      const next: MarkRect[] = [];
      const anchored: StickyPlacement[] = [];
      const stickyAnchors = new Map<string, DOMRect>();
      const inlineMarks = [...surface.querySelectorAll("[data-idea-mark]")];

      if (inlineMarks.length > 0) {
        for (const el of inlineMarks) {
          if (!(el instanceof HTMLElement)) continue;
          const id = el.dataset.ideaMark;
          if (!id || stickyAnchors.has(id)) continue;
          const idea = ideas.find((item) => item.id === id);
          if (!idea || idea.status === "resolved") continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          stickyAnchors.set(id, rect);
        }
      } else if (root) {
        for (const idea of ideas) {
          if (idea.status === "resolved") continue;
          if (idea.selector.kind === "pdf-region") continue;
          const range = rangeFromSelector(root, idea.selector);
          if (!range) continue;
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
          for (const rect of rects) {
            next.push({
              id: idea.id,
              color: idea.color,
              left: rect.left - surfaceRect.left,
              top: rect.top - surfaceRect.top,
              width: rect.width,
              height: rect.height,
            });
          }
          const anchor = rects[0] ?? rects.at(-1);
          if (anchor) stickyAnchors.set(idea.id, anchor);
        }
      }

      for (const idea of ideas) {
        if (idea.status === "resolved") continue;
        const anchor = stickyAnchors.get(idea.id);
        if (!anchor) continue;
        placeSticky(idea, anchor, surfaceRect, anchored);
      }

      setMarks(next);
      setStickies(anchored);
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(surface);
    if (root) resizeObserver.observe(root);

    const mutationObserver = root ? null : new MutationObserver(update);
    if (mutationObserver) {
      mutationObserver.observe(surface, { childList: true, subtree: true, attributes: true });
    }

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [ideas, contentKey, ideaTarget?.kind, anchorRootRef, surfaceRef]);

  const showIdea = (id: string) => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    setHoveredIdeaId(id);
  };
  const hideIdea = () => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHoveredIdeaId(null), 100);
  };

  const captureDomSelection = (event: MouseEvent<HTMLElement>) => {
    if (!canAnnotate) return;
    if (captureSelection) {
      const picked = captureSelection(event.clientX, event.clientY, event.type === "contextmenu");
      if (!picked) {
        setSelection(null);
        return;
      }
      setSelection(picked);
      if (event.type === "contextmenu") {
        event.preventDefault();
        setMenu(picked);
        setSelection(null);
      }
      return;
    }
    const root = anchorRootRef?.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection) {
      setSelection(null);
      return;
    }
    let range = browserSelection.rangeCount > 0 && !browserSelection.isCollapsed
      ? browserSelection.getRangeAt(0).cloneRange()
      : null;
    if (!range && event.type === "contextmenu") {
      const documentWithCaret = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
      range = position ? document.createRange() : documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
      if (range && position) range.setStart(position.offsetNode, position.offset);
      if (range && position) range.collapse(true);
      if (range?.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent ?? "";
        let start = range.startOffset;
        let end = range.startOffset;
        while (start > 0 && !/\s/u.test(text[start - 1])) start -= 1;
        while (end < text.length && !/\s/u.test(text[end])) end += 1;
        range.setStart(range.startContainer, start);
        range.setEnd(range.startContainer, end);
      }
    }
    if (!range) {
      setSelection(null);
      return;
    }
    const selector = selectorFromRange(root, range);
    if (!selector) return;
    const rangeRect = range.getBoundingClientRect();
    const picked = { selector, x: rangeRect.left, y: rangeRect.top };
    setSelection(picked);
    if (event.type === "contextmenu") {
      event.preventDefault();
      setMenu(picked);
      setSelection(null);
    }
  };

  const openComposer = (picked: CaptureResult) => {
    if (!onCreateIdea) return;
    setContent("");
    setComposer(picked);
    setSelection(null);
    setMenu(null);
  };

  const addSelectionToChat = (picked: CaptureResult) => {
    const text = (picked.selector.exact ?? "").trim();
    if (!text || !onAddToChat) return;
    onAddToChat(text);
    setSelection(null);
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const submitIdea = async () => {
    const note = content.trim();
    if (!composer || !note || !onCreateIdea) return;
    const saved = await onCreateIdea(composer.selector, note);
    if (!saved) return;
    setComposer(null);
    setContent("");
    window.getSelection()?.removeAllRanges();
  };

  const menuItems: ContextMenuItem[] = menu
    ? [
        ...(onCreateIdea
          ? [{ type: "item" as const, label: "添加 Idea", onClick: () => openComposer(menu) }]
          : []),
        ...(onAddToChat
          ? [{ type: "item" as const, label: "加入对话", onClick: () => addSelectionToChat(menu) }]
          : []),
        ...(onLinkRange && menu.selector.kind !== "pdf-region"
          ? [{
              type: "item" as const,
              label: linkLabel ?? "链接",
              onClick: () => {
                const selector = menu.selector;
                if (selector.kind === "pdf-region") return;
                onLinkRange({ start: selector.start, end: selector.end });
              },
            }]
          : []),
      ]
    : [];

  return (
    <div
      ref={surfaceRef as RefObject<HTMLDivElement>}
      className={`${className ?? ""} md-annotation-surface${canAnnotate ? " md-annotatable" : ""}`.trim()}
      onMouseUp={captureDomSelection}
      onContextMenu={captureDomSelection}
      onMouseOver={(event) => {
        const mark = (event.target as HTMLElement | null)?.closest("[data-idea-mark]") as HTMLElement | null;
        if (mark?.dataset.ideaMark) showIdea(mark.dataset.ideaMark);
      }}
      onMouseOut={(event) => {
        const mark = (event.relatedTarget as HTMLElement | null)?.closest?.("[data-idea-mark]") as HTMLElement | null;
        const sticky = (event.relatedTarget as HTMLElement | null)?.closest?.(".pdf-idea-sticky, .idea-sticky-layer");
        if (!mark && !sticky) hideIdea();
      }}
    >
      {ideasVisible && marks.length > 0 && (
        <div className="idea-mark-layer">
          {marks.map((mark, index) => (
            <span
              key={`${mark.id}:${index}`}
              data-idea-mark={mark.id}
              className={`idea-mark${hoveredIdeaId === mark.id ? " active" : ""}`}
              style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
              tabIndex={0}
              role="button"
              aria-label="查看 Idea"
              onMouseEnter={() => showIdea(mark.id)}
              onMouseLeave={hideIdea}
              onFocus={() => showIdea(mark.id)}
              onBlur={hideIdea}
            />
          ))}
        </div>
      )}
      {children}
      {ideas.some((idea) => idea.status === "open") && onIdeasVisible && (
        <button
          type="button"
          className={`idea-surface-toggle${ideasVisible ? " active" : ""}`}
          title={ideasVisible ? "隐藏全部便签" : "显示全部便签"}
          onClick={() => onIdeasVisible(!ideasVisible)}
        >
          <StickyNote size={14} />
          {ideasVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>{ideasVisible ? "隐藏便签" : `显示便签 · ${ideas.filter((idea) => idea.status === "open").length}`}</span>
        </button>
      )}
      {ideasVisible && hoveredIdeaId && (() => {
        const visible = stickies.filter((sticky) => sticky.idea.id === hoveredIdeaId);
        if (visible.length === 0) return null;
        const layer = visible.map((sticky) => (
          <IdeaStickyNote
            key={sticky.idea.id}
            placement={sticky}
            onUpdate={onUpdateIdea}
            onEnter={() => showIdea(sticky.idea.id)}
            onLeave={hideIdea}
          />
        ));
        if (visible.some((sticky) => sticky.fixed)) {
          return createPortal(<div className="idea-sticky-layer idea-sticky-layer-fixed">{layer}</div>, document.body);
        }
        return <div className="idea-sticky-layer">{layer}</div>;
      })()}
      {selection &&
        createPortal(
          <div
            className="idea-selection-actions"
            style={{
              top: "auto",
              left: "auto",
              right: Math.max(8, window.innerWidth - selection.x),
              bottom: Math.max(8, window.innerHeight - selection.y),
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            {onCreateIdea && (
              <button type="button" className="idea-selection-action" onClick={() => openComposer(selection)}>
                + Idea
              </button>
            )}
            {onAddToChat && (
              <button type="button" className="idea-selection-action" onClick={() => addSelectionToChat(selection)}>
                加入对话
              </button>
            )}
          </div>,
          document.body,
        )}
      {composer &&
        createPortal(
          <div
            className="idea-composer idea-composer-anchor"
            style={{
              top: "auto",
              left: "auto",
              right: Math.max(8, window.innerWidth - composer.x),
              bottom: Math.max(8, window.innerHeight - composer.y),
            }}
          >
            <div className="idea-composer-quote">“{(composer.selector.exact ?? "选中区域").slice(0, 120)}”</div>
            <textarea
              autoFocus
              value={content}
              maxLength={20_000}
              placeholder="记下你的想法…"
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submitIdea();
                if (event.key === "Escape") setComposer(null);
              }}
            />
            <div className="idea-composer-actions">
              <button type="button" onClick={() => setComposer(null)}>取消</button>
              <button type="button" className="primary" disabled={!content.trim()} onClick={() => void submitIdea()}>保存 Idea</button>
            </div>
          </div>,
          document.body,
        )}
      <ContextMenu
        open={menu !== null && menuItems.length > 0}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function IdeaStickyNote({
  placement,
  onUpdate,
  onEnter,
  onLeave,
}: {
  placement: StickyPlacement;
  onUpdate?: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { idea, left, top, width, right, bottom, anchorX, anchorY, fixed } = placement;
  const [draft, setDraft] = useState(idea.content);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== idea.content;
  useEffect(() => setDraft(idea.content), [idea.content]);
  const save = async () => {
    if (!onUpdate || !draft.trim() || !dirty || saving) return;
    setSaving(true);
    try { await onUpdate(idea.id, { content: draft.trim() }); } finally { setSaving(false); }
  };
  const threadWidth = fixed ? 0 : Math.max(10, Math.abs(anchorX - (left + width)));
  const threadDx = Math.min(0, anchorX - left);
  return (
    <div
      className={`idea-sticky idea-sticky-hover${fixed ? " idea-sticky-fixed" : ""}`}
      style={
        fixed
          ? {
              width,
              top: "auto",
              left: "auto",
              right: right ?? 0,
              bottom: bottom ?? 0,
              transform: "none",
            }
          : { width, transform: `translate3d(${left}px, ${top}px, 0)` }
      }
      data-idea-sticky={idea.id}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {!fixed && (
        <span
          className="idea-sticky-thread"
          style={{
            width: threadWidth,
            transform: `translate3d(${threadDx}px, ${anchorY - top}px, 0)`,
          }}
          aria-hidden="true"
        />
      )}
      <div className="idea-sticky-head">
        <span>IDEA</span>
        <small>{new Date(idea.updatedAt).toLocaleDateString()}</small>
      </div>
      <div className="idea-sticky-quote">“{idea.selector.exact}”</div>
      <textarea value={draft} aria-label="Idea 便签内容" onChange={(event) => setDraft(event.target.value)} />
      <div className="idea-sticky-foot">
        <span>悬浮便签</span>
        {dirty && (
          <button type="button" disabled={saving || !draft.trim()} onClick={() => void save()}>
            <Check size={13} /> {saving ? "保存中" : "保存"}
          </button>
        )}
      </div>
    </div>
  );
}
