import { Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { AgentAttachment, AgentSessionMessage, AgentSessionSummary, Idea, IdeaSelector, PageSummary } from "../api";
import { AgentChatFeed, AgentComposer } from "./agentChatCore";
import { CentaurChromeSlot } from "./CentaurChromeSlot";
import { Presence } from "./Presence";
import { ContextMenu } from "./ContextMenu";
import { HistoryGlyph } from "./iconGlyphs";

type AgentPaneProps = {
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
  modelLabel: string;
  modelMissing: boolean;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
  attachments: AgentAttachment[];
  canAttachCurrent: boolean;
  currentPageLabel: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onArchiveSession: (id: string, archived: boolean) => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpen: (id: string) => void;
  onAttachCurrent: () => void;
  onDetach: (id: string) => void;
  onRelatedFiles: (session: AgentSessionSummary) => void;
  onCloseSession: (id: string) => void;
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  onCreateIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  headerCentaurShown?: boolean;
};

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export function AgentPane({
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
  modelLabel,
  modelMissing,
  modelValue,
  modelGroups,
  mock,
  attachments,
  canAttachCurrent,
  currentPageLabel,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onArchiveSession,
  onSwitchModel,
  onDraft,
  onSend,
  onStop,
  onOpen,
  onAttachCurrent,
  onDetach,
  onRelatedFiles,
  onCloseSession,
  ideas,
  ideasVisible,
  onIdeasVisible,
  onCreateIdea,
  onUpdateIdea,
  headerCentaurShown = true,
}: AgentPaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionMenu, setSessionMenu] = useState<{
    x: number;
    y: number;
    id: string;
    archived: boolean;
  } | null>(null);

  const empty = messages.length === 0 && !pendingUser && !busy;
  const liveSessions = useMemo(() => sessions.filter((s) => !s.archived), [sessions]);
  const archivedSessions = useMemo(() => sessions.filter((s) => s.archived), [sessions]);

  return (
    <div className="agent-pane agent-chat">
      <div className="agent-chat-header">
        <div className="agent-session-tabs" role="tablist" aria-label="已打开会话">
          {openSessionIds.map((id) => {
            const session = sessions.find((item) => item.id === id);
            if (!session) return null;
            return (
              <div key={id} className={`agent-session-tab${id === sessionId ? " active" : ""}`}>
                <button type="button" role="tab" aria-selected={id === sessionId} onClick={() => onSelectSession(id)}>
                  {session.title || "新对话"}
                </button>
                <button
                  type="button"
                  className="agent-session-tab-close"
                  aria-label={`关闭 ${session.title || "新对话"}`}
                  onClick={() => onCloseSession(id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <CentaurChromeSlot variant="header" open={!empty && headerCentaurShown} />
        <button
          type="button"
          className={`agent-round-btn${historyOpen ? " active" : ""}`}
          data-icon="history"
          title="会话记录"
          aria-label="会话记录"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <HistoryGlyph />
        </button>
        <button
          type="button"
          className="agent-round-btn"
          data-icon="plus"
          title="新对话"
          aria-label="新对话"
          disabled={busy}
          onClick={() => {
            onNewChat();
            setHistoryOpen(false);
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="agent-chat-main">
        <Presence open={historyOpen}>
          <div className="agent-session-sheet" role="dialog" aria-label="会话记录">
            <div className="agent-session-sheet-head">
              <span>会话</span>
            </div>
            <div className="agent-session-list">
              {liveSessions.length === 0 && archivedSessions.length === 0 && (
                <div className="agent-session-empty">还没有对话</div>
              )}
              {liveSessions.length === 0 && archivedSessions.length > 0 && (
                <div className="agent-session-empty">没有进行中的对话</div>
              )}
              {liveSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`agent-session-item${session.id === sessionId ? " active" : ""}`}
                  disabled={busy && session.id !== sessionId}
                  onClick={() => {
                    onSelectSession(session.id);
                    setHistoryOpen(false);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setSessionMenu({
                      x: event.clientX,
                      y: event.clientY,
                      id: session.id,
                      archived: false,
                    });
                  }}
                >
                  <span className="agent-session-title">{session.title || "新对话"}</span>
                  <span className="agent-session-meta">{formatSessionTime(session.updatedAt)}</span>
                </button>
              ))}
              {archivedSessions.length > 0 && (
                <>
                  <div className="agent-session-section">归档</div>
                  {archivedSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`agent-session-item${session.id === sessionId ? " active" : ""}`}
                      disabled={busy && session.id !== sessionId}
                      onClick={() => {
                        onSelectSession(session.id);
                        setHistoryOpen(false);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSessionMenu({
                          x: event.clientX,
                          y: event.clientY,
                          id: session.id,
                          archived: true,
                        });
                      }}
                    >
                      <span className="agent-session-title">{session.title || "新对话"}</span>
                      <span className="agent-session-meta">{formatSessionTime(session.updatedAt)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </Presence>

        <AgentChatFeed
          listRef={listRef}
          followOutputRef={followOutput}
          scrollPaused={historyOpen}
          messages={messages}
          pendingUser={pendingUser}
          streamingText={streamingText}
          streamingTools={streamingTools}
          streamingPhase={streamingPhase}
          busy={busy}
          modelMissing={modelMissing}
          pages={pages}
          ideas={ideas}
          ideasVisible={ideasVisible}
          onIdeasVisible={onIdeasVisible}
          sessionId={sessionId}
          onCreateIdea={onCreateIdea}
          onUpdateIdea={onUpdateIdea}
          onOpen={onOpen}
        />

        <AgentComposer
          variant="panel"
          draft={draft}
          busy={busy}
          modelMissing={modelMissing}
          modelLabel={modelLabel}
          modelValue={modelValue}
          modelGroups={modelGroups}
          mock={mock}
          messages={messages}
          attachments={attachments}
          canAttachCurrent={canAttachCurrent}
          currentPageLabel={currentPageLabel}
          onDraft={onDraft}
          onSend={onSend}
          onStop={onStop}
          onSwitchModel={onSwitchModel}
          onAttachCurrent={onAttachCurrent}
          onDetach={onDetach}
        />
      </div>

      <ContextMenu
        open={sessionMenu !== null}
        x={sessionMenu?.x ?? 0}
        y={sessionMenu?.y ?? 0}
        items={
          sessionMenu
            ? [
                {
                  type: "item",
                  label: sessionMenu.archived ? "取消归档" : "归档",
                  disabled: busy && sessionMenu.id === sessionId,
                  onClick: () => onArchiveSession(sessionMenu.id, !sessionMenu.archived),
                },
                {
                  type: "item",
                  label: "删除",
                  danger: true,
                  disabled: busy && sessionMenu.id === sessionId,
                  onClick: () => onDeleteSession(sessionMenu.id),
                },
                {
                  type: "item",
                  label: "查看相关文件",
                  onClick: () => {
                    const session = sessions.find((item) => item.id === sessionMenu.id);
                    if (session) onRelatedFiles(session);
                  },
                },
              ]
            : []
        }
        onClose={() => setSessionMenu(null)}
      />
    </div>
  );
}
