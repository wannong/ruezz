import { PanelCloseGlyph } from "./iconGlyphs";
import type { AgentAttachment, AgentSessionMessage, AgentSessionSummary, GraphDto, Idea, IdeaSelector, PageSummary } from "../api";
import { attachResizeX } from "../lib/pointerResize";
import type { OutlineItem } from "../lib/outline";
import type { Theme } from "../theme";
import type { GraphViewScope } from "../lib/graph";
import { AgentPane } from "./AgentPane";
import { LocalGraphPane } from "./LocalGraphPane";
import { OutlinePane } from "./OutlinePane";
import { Presence } from "./Presence";
import { IdeasPane } from "./IdeasPane";

export type RightView = "agent" | "outline" | "ideas" | "graph";

type RightSidebarProps = {
  view: RightView;
  onView: (view: RightView) => void;
  width: number;
  collapsed: boolean;
  overlay: boolean;
  messages: AgentSessionMessage[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string; status: "running" | "done" | "error" }>;
  streamingPhase: "thinking" | "tool" | "answer" | null;
  draft: string;
  busy: boolean;
  pages: PageSummary[];
  sessions: AgentSessionSummary[];
  sessionId: string | null;
  openSessionIds: string[];
  outline: OutlineItem[];
  pageId: string | null;
  graph: GraphDto | null;
  ideas: Idea[];
  ideasVisible: boolean;
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
  attachments: AgentAttachment[];
  canAttachCurrent: boolean;
  currentPageLabel: string;
  graphHops: GraphViewScope;
  onGraphHops: (scope: GraphViewScope) => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onArchiveSession: (id: string, archived: boolean) => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
  onAttachCurrent: () => void;
  onDetachAttachment: (id: string) => void;
  onRelatedFiles: (session: AgentSessionSummary) => void;
  onCloseSession: (id: string) => void;
  onResize: (dx: number) => void;
  onCollapse: () => void;
  onIdeasVisible: (visible: boolean) => void;
  onNavigateIdea: (idea: Idea) => void;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onDeleteIdea: (id: string) => Promise<void>;
  onCreateAgentIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
  headerCentaurShown?: boolean;
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
  streamingPhase,
  draft,
  busy,
  pages,
  sessions,
  sessionId,
  openSessionIds,
  outline,
  pageId,
  graph,
  ideas,
  ideasVisible,
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
  attachments,
  canAttachCurrent,
  currentPageLabel,
  onAttachCurrent,
  onDetachAttachment,
  onRelatedFiles,
  onCloseSession,
  onIdeasVisible,
  onNavigateIdea,
  onUpdateIdea,
  onDeleteIdea,
  onCreateAgentIdea,
  headerCentaurShown = true,
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
        <button type="button" className={view === "ideas" ? "active" : ""} onClick={() => onView("ideas")}>
          Idea
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
           streamingPhase={streamingPhase}
          draft={draft}
          busy={busy}
          pages={pages}
          sessions={sessions}
           sessionId={sessionId}
           openSessionIds={openSessionIds}
          onDraft={onDraft}
          onSend={onSend}
          onStop={onStop}
          onOpen={onOpen}
          modelLabel={modelLabel}
          modelMissing={modelMissing}
          modelValue={modelValue}
          modelGroups={modelGroups}
           mock={mock}
           attachments={attachments}
           canAttachCurrent={canAttachCurrent}
           currentPageLabel={currentPageLabel}
           onAttachCurrent={onAttachCurrent}
           onDetach={onDetachAttachment}
           onRelatedFiles={onRelatedFiles}
            onCloseSession={onCloseSession}
            ideas={ideas}
            ideasVisible={ideasVisible}
            onIdeasVisible={onIdeasVisible}
            onCreateIdea={onCreateAgentIdea}
            onUpdateIdea={onUpdateIdea}
          onNewChat={onNewChat}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onArchiveSession={onArchiveSession}
          onSwitchModel={onSwitchModel}
          headerCentaurShown={headerCentaurShown}
        />
      )}
      {view === "outline" && <OutlinePane items={outline} onJump={onJump} />}
      {view === "ideas" && (
        <IdeasPane
          ideas={ideas}
          pageId={pageId}
          sessionId={sessionId}
          visible={ideasVisible}
          onVisible={onIdeasVisible}
          onNavigate={onNavigateIdea}
          onUpdate={onUpdateIdea}
          onDelete={onDeleteIdea}
        />
      )}
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
