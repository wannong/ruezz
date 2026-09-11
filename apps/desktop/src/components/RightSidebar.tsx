import { PanelCloseGlyph } from "./iconGlyphs";
import type { AgentSessionMessage, AgentSessionSummary, GraphDto, PageSummary } from "../api";
import { attachResizeX } from "../lib/pointerResize";
import type { OutlineItem } from "../lib/outline";
import type { Theme } from "../theme";
import type { GraphViewScope } from "../lib/graph";
import { AgentPane } from "./AgentPane";
import { LocalGraphPane } from "./LocalGraphPane";
import { OutlinePane } from "./OutlinePane";
import { Presence } from "./Presence";

export type RightView = "agent" | "outline" | "graph";

type RightSidebarProps = {
  view: RightView;
  onView: (view: RightView) => void;
  width: number;
  collapsed: boolean;
  overlay: boolean;
  messages: AgentSessionMessage[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string }>;
  draft: string;
  busy: boolean;
  pages: PageSummary[];
  sessions: AgentSessionSummary[];
  sessionId: string | null;
  outline: OutlineItem[];
  pageId: string | null;
  graph: GraphDto | null;
  theme: Theme;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpen: (id: string) => void;
  onJump: (id: string) => void;
  modelLabel: string;
  modelMissing: boolean;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
  graphHops: GraphViewScope;
  onGraphHops: (scope: GraphViewScope) => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onArchiveSession: (id: string, archived: boolean) => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
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
  pendingUser,
  streamingText,
  streamingTools,
  draft,
  busy,
  pages,
  sessions,
  sessionId,
  outline,
  pageId,
  graph,
  theme,
  onDraft,
  onSend,
  onStop,
  onOpen,
  onJump,
  onResize,
  onCollapse,
  modelLabel,
  modelMissing,
  modelValue,
  modelGroups,
  mock,
  graphHops,
  onGraphHops,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onArchiveSession,
  onSwitchModel,
}: RightSidebarProps) {
  const aside = (
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
          data-icon="collapse"
          title="收起"
          aria-label="收起右侧栏"
          onClick={onCollapse}
        >
          <PanelCloseGlyph />
        </button>
      </div>
      {view === "agent" && (
        <AgentPane
          messages={messages}
          pendingUser={pendingUser}
          streamingText={streamingText}
          streamingTools={streamingTools}
          draft={draft}
          busy={busy}
          pages={pages}
          sessions={sessions}
          sessionId={sessionId}
          onDraft={onDraft}
          onSend={onSend}
          onStop={onStop}
          onOpen={onOpen}
          modelLabel={modelLabel}
          modelMissing={modelMissing}
          modelValue={modelValue}
          modelGroups={modelGroups}
          mock={mock}
          onNewChat={onNewChat}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onArchiveSession={onArchiveSession}
          onSwitchModel={onSwitchModel}
        />
      )}
      {view === "outline" && <OutlinePane items={outline} onJump={onJump} />}
      {view === "graph" && (
        <LocalGraphPane
          graph={graph}
          pageId={pageId}
          theme={theme}
          scope={graphHops}
          onScope={onGraphHops}
          onOpen={onOpen}
        />
      )}
    </aside>
  );

  if (overlay) return <Presence open={!collapsed}>{aside}</Presence>;
  if (collapsed) return null;
  return aside;
}
