import { PanelRightClose } from "lucide-react";
import type { GraphDto, PageSummary } from "../api";
import { attachResizeX } from "../lib/pointerResize";
import type { OutlineItem } from "../lib/outline";
import type { Theme } from "../theme";
import { AgentPane, type ChatMessage } from "./AgentPane";
import { LocalGraphPane } from "./LocalGraphPane";
import { OutlinePane } from "./OutlinePane";

export type RightView = "agent" | "outline" | "graph";

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
  graph: GraphDto | null;
  theme: Theme;
  onDraft: (value: string) => void;
  onSend: () => void;
  onOpen: (id: string) => void;
  onJump: (id: string) => void;
  onResize: (dx: number) => void;
  onCollapse: () => void;
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
  graph,
  theme,
  onDraft,
  onSend,
  onOpen,
  onJump,
  onResize,
  onCollapse,
}: RightSidebarProps) {
  if (collapsed) return null;

  return (
    <aside className={`sidebar sidebar-right${overlay ? " overlay" : ""}`} style={{ width }}>
      <div
        className="resize-handle resize-handle-left"
        onPointerDown={(e) => attachResizeX(e, (dx) => onResize(-dx))}
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
        <button type="button" className={view === "graph" ? "active" : ""} onClick={() => onView("graph")}>
          图谱
        </button>
        <button
          type="button"
          className="sidebar-collapse"
          title="收起"
          aria-label="收起右侧栏"
          onClick={onCollapse}
        >
          <PanelRightClose size={14} />
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
      {view === "graph" && (
        <LocalGraphPane graph={graph} pageId={pageId} theme={theme} onOpen={onOpen} />
      )}
    </aside>
  );
}
