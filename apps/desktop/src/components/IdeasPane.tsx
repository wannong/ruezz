import { Check, Eye, EyeOff, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Idea } from "../api";

type IdeasPaneProps = {
  ideas: Idea[];
  pageId: string | null;
  sessionId: string | null;
  visible: boolean;
  onVisible: (visible: boolean) => void;
  onNavigate: (idea: Idea) => void;
  onUpdate: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function IdeasPane({
  ideas,
  pageId,
  sessionId,
  visible,
  onVisible,
  onNavigate,
  onUpdate,
  onDelete,
}: IdeasPaneProps) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const shown = useMemo(() => {
    if (scope === "all") return ideas;
    return ideas.filter((idea) =>
      idea.target.kind === "page"
        ? Boolean(pageId && idea.target.pageId === pageId)
        : Boolean(sessionId && idea.target.sessionId === sessionId),
    );
  }, [ideas, pageId, scope, sessionId]);

  return (
    <div className="ideas-pane">
      <div className="ideas-toolbar">
        <div className="ideas-scope" role="group" aria-label="Idea 范围">
          <button type="button" className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>当前</button>
          <button type="button" className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>全部</button>
        </div>
        <button type="button" className="ideas-visibility" title={visible ? "隐藏全部便签" : "显示全部便签"} onClick={() => onVisible(!visible)}>
          {visible ? <Eye size={14} /> : <EyeOff size={14} />}
          {visible ? "隐藏便签" : "显示便签"}
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="empty">选中文字或右键，添加第一条 Idea</div>
      ) : (
        <div className="idea-list">
          {shown.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onNavigate={onNavigate} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, onNavigate, onUpdate, onDelete }: {
  idea: Idea;
  onNavigate: (idea: Idea) => void;
  onUpdate: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(idea.content);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== idea.content;
  const run = async (action: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    try { await action(); } finally { setSaving(false); }
  };
  return (
            <article className={`idea-card idea-card-${idea.color}${idea.status === "resolved" ? " resolved" : ""}`}>
              <button type="button" className="idea-quote" onClick={() => onNavigate(idea)} title="跳回原文">
                “{idea.selector.exact}”
              </button>
              <textarea
                value={draft}
                aria-label="Idea 内容"
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="idea-card-footer">
                <span>{idea.target.kind === "page" ? idea.target.pageId : "Agent 回复"}</span>
                <div>
                  {dirty && <button type="button" disabled={saving || !draft.trim()} onClick={() => void run(() => onUpdate(idea.id, { content: draft.trim() }))}>保存</button>}
                  <button type="button" disabled={saving} title={idea.status === "resolved" ? "重新打开" : "标为已解决"} onClick={() => void run(() => onUpdate(idea.id, { content: draft.trim() || idea.content, status: idea.status === "resolved" ? "open" : "resolved" }))}>
                    <Check size={14} />
                  </button>
                  <button type="button" disabled={saving} title="删除 Idea" onClick={() => void run(() => onDelete(idea.id))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
  );
}
