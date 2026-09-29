import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { Idea, IdeaSelector, PageContent, PageSummary } from "../api";
import { splitFrontmatter, joinFrontmatter } from "../lib/frontmatter";
import { MarkdownLiveEditor } from "./MarkdownLiveEditor";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";
import type { PageViewMemory } from "../lib/pageViewMemory";

const DocumentPreview = lazy(() =>
  import("./DocumentPreview").then((mod) => ({ default: mod.DocumentPreview })),
);

export type NoteMode = "live" | "source" | "file";

const documentPreviewFallback = <div className="empty-center loading-breathe">正在加载预览…</div>;

type NoteViewProps = {
  page: PageContent;
  pages: PageSummary[];
  mode: NoteMode;
  draft: string;
  dirty: boolean;
  saving: boolean;
  onMode: (mode: NoteMode) => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  favorite: boolean;
  onFavorite: () => void;
  onOpen: (id: string) => void;
  onLink: (range: { start: number; end: number }) => void;
  assetRoot?: string;
  onUpdateTags: (tags: string[]) => Promise<void>;
  tagError?: string | null;
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  onCreateIdea: (selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onAddToChat?: (text: string) => void;
  onRename?: (name: string) => void;
  viewMemory?: PageViewMemory;
  onViewMemoryChange?: (patch: Partial<PageViewMemory>) => void;
};

export function NoteView({
  page,
  pages,
  mode,
  draft,
  dirty,
  saving,
  onMode,
  onDraft,
  onSave,
  favorite,
  onFavorite,
  onOpen,
  onLink,
  assetRoot,
  onUpdateTags,
  tagError,
  ideas,
  ideasVisible,
  onIdeasVisible,
  onCreateIdea,
  onUpdateIdea,
  onAddToChat,
  onRename,
  viewMemory,
  onViewMemoryChange,
}: NoteViewProps) {
  const readRef = useRef<HTMLDivElement>(null);
  const readRestoredRef = useRef(false);
  const skipReadPersistRef = useRef(true);
  const savedReadMemoryRef = useRef(viewMemory?.readScrollTop ?? 0);
  savedReadMemoryRef.current = viewMemory?.readScrollTop ?? 0;
  const sourceType = page.sourceType?.toLowerCase();
  const hasSource = sourceType === "pdf" || sourceType === "docx";
  const isLiterature = page.type === "source";
  const [tags, setTags] = useState<string[]>(page.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [tagSaving, setTagSaving] = useState(false);

  const frontmatterParts = useMemo(() => splitFrontmatter(draft), [draft]);
  const liveBody = frontmatterParts.body;
  const frontmatterRef = useRef(frontmatterParts.frontmatter);
  frontmatterRef.current = frontmatterParts.frontmatter;

  const setLiveBody = useCallback((body: string) => {
    onDraft(joinFrontmatter(frontmatterRef.current, body));
  }, [onDraft]);

  const linkRangeInDraft = (range: { start: number; end: number }) => {
    const fmLen = (frontmatterParts.frontmatter?.length ?? 0);
    onLink({ start: range.start + fmLen, end: range.end + fmLen });
  };

  useEffect(() => setTags(page.tags ?? []), [page.id, page.tags]);
  useEffect(() => {
    readRestoredRef.current = false;
    skipReadPersistRef.current = true;
  }, [page.id]);
  useEffect(() => {
    return () => {
      const element = readRef.current;
      if (element && onViewMemoryChange) {
        onViewMemoryChange({ readScrollTop: element.scrollTop });
      }
    };
  }, [page.id, onViewMemoryChange]);
  useEffect(() => {
    if (mode !== "live") return;
    const element = readRef.current;
    if (!element || readRestoredRef.current) return;
    const saved = savedReadMemoryRef.current;
    requestAnimationFrame(() => {
      if (!readRef.current) return;
      readRef.current.scrollTop = saved;
      readRestoredRef.current = true;
      skipReadPersistRef.current = false;
    });
  }, [mode, page.id]);
  useEffect(() => {
    const element = readRef.current;
    if (!element || mode !== "live" || !onViewMemoryChange) return;
    const onScroll = () => {
      if (skipReadPersistRef.current) return;
      onViewMemoryChange({ readScrollTop: element.scrollTop });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [mode, onViewMemoryChange, page.id]);
  useEffect(() => {
    if (!isLiterature && mode === "file" && !hasSource) onMode("live");
  }, [hasSource, isLiterature, mode, onMode]);

  const updateTags = async (next: string[]) => {
    const normalized = [...new Set(next.map((tag) => tag.trim()).filter(Boolean))];
    setTags(normalized);
    setTagSaving(true);
    try { await onUpdateTags(normalized); } catch { /* parent reports the error */ }
    finally { setTagSaving(false); }
  };
  const addTag = () => {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) { setTagInput(""); return; }
    setTagInput("");
    void updateTags([...tags, value]);
  };

  return (
    <div className="note-view">
      <div className="note-header">
        <div>
          {!(isLiterature && hasSource) && <h1 className="note-title">{page.title ?? page.id}</h1>}
          {!isLiterature && <div className="note-id">{page.path}</div>}
          <div className="note-tags" aria-label="页面标签">
            {tags.map((tag) => <span className="tag-chip" key={tag}>#{tag}<button type="button" aria-label={`删除标签 ${tag}`} disabled={tagSaving} onClick={() => void updateTags(tags.filter((item) => item !== tag))}>×</button></span>)}
            <input className="tag-input" value={tagInput} disabled={tagSaving} placeholder="添加标签" aria-label="添加标签" onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
            {tagSaving && <span className="file-meta">保存中…</span>}
          </div>
          {tagError && <div className="error note-tag-error">{tagError}</div>}
        </div>
          <div className="note-toolbar">
            {!isLiterature && (
              <div className="note-mode">
                <button type="button" className={mode === "live" ? "active" : ""} onClick={() => onMode("live")}>
                  Live
                </button>
                <button type="button" className={mode === "source" ? "active" : ""} onClick={() => onMode("source")}>
                  源码
                </button>
              </div>
            )}
            {!isLiterature && (
              <button
                type="button"
                className={`favorite-star note-favorite${favorite ? " active" : ""}`}
                title={favorite ? "取消收藏" : "收藏"}
                aria-label={favorite ? `取消收藏 ${page.title ?? page.id}` : `收藏 ${page.title ?? page.id}`}
                aria-pressed={favorite}
                onClick={onFavorite}
              >
                <Star size={15} fill={favorite ? "currentColor" : "none"} />
              </button>
            )}
            {!isLiterature && hasSource && (
              <div className="note-mode">
                <button type="button" className={mode === "file" ? "active" : ""} onClick={() => onMode("file")}>原件</button>
              </div>
            )}
            {isLiterature && (
              <button
                type="button"
                className={`favorite-star note-favorite${favorite ? " active" : ""}`}
                title={favorite ? "取消收藏" : "收藏"}
                aria-label={favorite ? `取消收藏 ${page.title ?? page.id}` : `收藏 ${page.title ?? page.id}`}
                aria-pressed={favorite}
                onClick={onFavorite}
              >
                <Star size={15} fill={favorite ? "currentColor" : "none"} />
              </button>
            )}
            {!isLiterature && (
              <button
                type="button"
                className="primary note-save"
                disabled={!dirty || saving}
                onClick={onSave}
              >
                {saving ? "保存中…" : dirty ? "保存" : "已保存"}
              </button>
            )}
        </div>
      </div>
      {isLiterature ? (
        hasSource ? (
          <Suspense fallback={documentPreviewFallback}>
            <DocumentPreview
              pageId={page.id}
              type={sourceType!}
              title={page.title ?? page.id.split("/").pop() ?? page.id}
              onRename={onRename}
              ideas={ideas}
              ideasVisible={ideasVisible}
              onIdeasVisible={onIdeasVisible}
              onCreateIdea={onCreateIdea}
              onUpdateIdea={onUpdateIdea}
              viewMemory={viewMemory}
              onViewMemoryChange={onViewMemoryChange}
            />
          </Suspense>
        ) : (
          <div className="empty-center">此文献暂无可浏览的原件</div>
        )
      ) : mode === "file" && hasSource ? (
        <Suspense fallback={documentPreviewFallback}>
          <DocumentPreview
            pageId={page.id}
            type={sourceType!}
            title={page.title ?? page.id.split("/").pop() ?? page.id}
            onRename={onRename}
            ideas={ideas}
            ideasVisible={ideasVisible}
            onIdeasVisible={onIdeasVisible}
            onCreateIdea={onCreateIdea}
            onUpdateIdea={onUpdateIdea}
            viewMemory={viewMemory}
            onViewMemoryChange={onViewMemoryChange}
          />
        </Suspense>
      ) : mode === "source" ? (
        <div className="note-source-editor">
          <MarkdownSourceEditor
            key={page.id}
            value={draft}
            onChange={onDraft}
            onSave={onSave}
            placeholder="Markdown 源码（含 YAML frontmatter）"
          />
        </div>
      ) : (
        <div className="note-read" ref={readRef}>
          <MarkdownLiveEditor
            editorKey={page.id}
            body={liveBody}
            onBodyChange={setLiveBody}
            onSave={onSave}
            pages={pages}
            onOpen={onOpen}
            assetRoot={assetRoot}
            basePath={page.path}
            ideaTarget={{ kind: "page", pageId: page.id }}
            ideas={ideas}
            ideasVisible={ideasVisible}
            onIdeasVisible={onIdeasVisible}
            onCreateIdea={onCreateIdea}
            onUpdateIdea={onUpdateIdea}
            onAddToChat={onAddToChat}
            onLink={linkRangeInDraft}
          />
        </div>
      )}
    </div>
  );
}
