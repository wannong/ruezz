import type { PageSummary } from "../api";
import type { OutlineItem } from "../lib/outline";
import { attachResize } from "./LeftSidebar";
import { AgentPane, type ChatMessage } from "./AgentPane";
import { BacklinksPane } from "./BacklinksPane";
import { OutlinePane } from "./OutlinePane";

export type RightView = "agent" | "outline" | "backlinks";

type RightSidebarProps = {
  view: RightView;
  onView: (view: RightView) => void;
  width: number;
  collapsed: boolean;
  overlay: boolean;
  messages: ChatMessage[];
  draft: string;
  busy: boolean;
  pages: PageSummary[];
  outline: OutlineItem[];
  pageId: string | null;
  backlinks: PageSummary[];
  onDraft: (value: string) => void;
  onSend: () => void;
  onOpen: (id: string) => void;
  onJump: (id: string) => void;
  onResize: (dx: number) => void;
};

export function RightSidebar({
  view,
  onView,
  width,
  collapsed,
  overlay,
  messages,
  draft,
  busy,
  pages,
  outline,
  pageId,
  backlinks,
  onDraft,
  onSend,
  onOpen,
  onJump,
  onResize,
}: RightSidebarProps) {
  if (collapsed) return null;

  return (
    <aside className={`sidebar sidebar-right${overlay ? " overlay" : ""}`} style={{ width }}>
      <div
        className="resize-handle resize-handle-left"
        onPointerDown={(e) => attachResize(e, (dx) => onResize(-dx))}
      />
      <div className="sidebar-tabs">
        <button type="button" className={view === "agent" ? "active" : ""} onClick={() => onView("agent")}>
          Agent
        </button>
        <button
          type="button"
          className={view === "outline" ? "active" : ""}
          onClick={() => onView("outline")}
        >
          大纲
        </button>
        <button
          type="button"
          className={view === "backlinks" ? "active" : ""}
          onClick={() => onView("backlinks")}
        >
          反链
        </button>
      </div>
      {view === "agent" && (
        <AgentPane
          messages={messages}
          draft={draft}
          busy={busy}
          pages={pages}
          onDraft={onDraft}
          onSend={onSend}
          onOpen={onOpen}
        />
      )}
      {view === "outline" && <OutlinePane items={outline} onJump={onJump} />}
      {view === "backlinks" && <BacklinksPane pageId={pageId} links={backlinks} onOpen={onOpen} />}
    </aside>
  );
}
