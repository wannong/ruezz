import { Paperclip, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentAttachment, AgentSessionMessage, AgentSessionSummary, Idea, IdeaSelector, PageSummary } from "../api";
import centaurIcon from "../assets/centaur-icon.svg";
import { parseModelSwitchKey } from "../lib/llmProviders";
import { loadPref, savePref } from "../lib/prefs";
import { attachResizeY } from "../lib/pointerResize";
import { MarkdownPreview } from "./MarkdownPreview";
import { Presence } from "./Presence";
import { PRESENCE_MS } from "../lib/usePresence";
import { WikilinkText } from "./WikilinkText";
import { ContextMenu } from "./ContextMenu";
import { GaugeGlyph, HistoryGlyph, SendGlyph, StopGlyph } from "./iconGlyphs";

const COMPOSER_MIN = 88;
const COMPOSER_MAX = 360;

function clampComposer(n: number): number {
  return Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, Math.round(n)));
}

type AgentPaneProps = {
  messages: AgentSessionMessage[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string }>;
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
  onCreateIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
};

function messageKey(message: AgentSessionMessage): string {
  return message.id;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function sessionUsage(messages: AgentSessionMessage[]): {
  input: number;
  output: number;
  totalTokens: number;
} {
  let input = 0;
  let output = 0;
  let totalTokens = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || !message.usage) continue;
    input += message.usage.input;
    output += message.usage.output;
    totalTokens = message.usage.totalTokens || totalTokens;
  }
  return { input, output, totalTokens: totalTokens || input + output };
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
  onCreateIdea,
}: AgentPaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [sessionMenu, setSessionMenu] = useState<{
    x: number;
    y: number;
    id: string;
    archived: boolean;
  } | null>(null);
  const [composerHeight, setComposerHeight] = useState(() =>
    clampComposer(loadPref("agentComposerHeight", COMPOSER_MIN)),
  );

  const empty = messages.length === 0 && !pendingUser && !busy;
  const usage = useMemo(() => sessionUsage(messages), [messages]);
  const modelName = modelValue.includes("::") ? modelValue.slice(modelValue.indexOf("::") + 2) : modelValue;
  const canSend = Boolean(draft.trim()) && !busy && !modelMissing;
  const liveSessions = useMemo(() => sessions.filter((s) => !s.archived), [sessions]);
  const archivedSessions = useMemo(() => sessions.filter((s) => s.archived), [sessions]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || historyOpen) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingUser, busy, streamingText, streamingTools, historyOpen]);

  useEffect(() => {
    savePref("agentComposerHeight", composerHeight);
  }, [composerHeight]);

  useEffect(() => {
    if (!modelOpen && !usageOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest(".agent-model-wrap") && !target.closest(".agent-usage-wrap")) {
        setModelOpen(false);
        setUsageOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [modelOpen, usageOpen]);

  return (
    <div className="agent-pane agent-chat">
      <div className="agent-chat-header">
        <div className="agent-session-tabs" role="tablist" aria-label="已打开会话">
          {openSessionIds.map((id) => {
            const session = sessions.find((item) => item.id === id);
            if (!session) return null;
            return <div key={id} className={`agent-session-tab${id === sessionId ? " active" : ""}`}><button type="button" role="tab" aria-selected={id === sessionId} onClick={() => onSelectSession(id)}>{session.title || "新对话"}</button><button type="button" className="agent-session-tab-close" aria-label={`关闭 ${session.title || "新对话"}`} onClick={() => onCloseSession(id)}>×</button></div>;
          })}
        </div>
        <button
          type="button"
          className={`agent-round-btn${historyOpen ? " active" : ""}`}
          data-icon="history"
          title="会话记录"
          aria-label="会话记录"
          onClick={() => {
            setHistoryOpen((open) => !open);
            setModelOpen(false);
            setUsageOpen(false);
          }}
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
            setModelOpen(false);
            setUsageOpen(false);
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
        <div className="agent-chat-view" ref={listRef}>
            {empty && (
              <div className="agent-welcome">
                <div className="agent-welcome-icon">
                  <img src={centaurIcon} alt="" width={64} height={64} />
                </div>
                {modelMissing ? (
                  <p>当前没有可用模型。请在设置中填写 API，并拉取或输入模型名。</p>
                ) : (
                  <p className="agent-welcome-hi">Hi there!</p>
                )}
              </div>
            )}
            {messages.map((m) => (
              <SessionMessageView
                key={messageKey(m)}
                message={m}
                pages={pages}
                ideas={ideas}
                ideasVisible={ideasVisible}
                sessionId={sessionId}
                onCreateIdea={onCreateIdea}
                onOpen={onOpen}
              />
            ))}
            {(pendingUser || busy) && (
              <div className="agent-turn agent-turn-pending">
                {pendingUser && (
                  <div className="msg msg-user msg-pending">
                    <div className="msg-role">你</div>
                    <div className="msg-body">
                      <WikilinkText text={pendingUser} pages={pages} onOpen={onOpen} />
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="msg msg-assistant msg-streaming">
                    <div className="msg-role">Agent</div>
                    <div className="msg-body">
                      {streamingText ? (
                        <>
                          <MarkdownPreview markdown={streamingText} pages={pages} onOpen={onOpen} />
                          <span className="stream-cursor" aria-hidden="true" />
                        </>
                      ) : (
                        <span className="msg-thinking">
                          {streamingPhase === "tool" || streamingTools.length > 0 ? "正在查阅知识库" : "准备回答"}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>

        <div className="agent-input-panel">
            <div
              className="composer-resize"
              role="separator"
              aria-orientation="horizontal"
              aria-label="调整输入框高度"
              title="拖拽调整输入框高度"
              onPointerDown={(e) =>
                attachResizeY(e, (dy) => setComposerHeight((h) => clampComposer(h - dy)))
              }
            />
            <div className="agent-input-toolbar">
            <div className="agent-model-wrap">
              <button
                type="button"
                className={`agent-model-name${modelMissing ? " warn" : ""}`}
                disabled={mock || modelGroups.length === 0}
                title={modelLabel}
                onClick={() => {
                  setModelOpen((open) => !open);
                  setUsageOpen(false);
                }}
              >
                {mock || modelGroups.length === 0 ? modelLabel : modelName || "选择模型"}
              </button>
              <Presence open={modelOpen && modelGroups.length > 0} duration={PRESENCE_MS.fast}>
                <div className="agent-model-menu" role="listbox">
                  {modelGroups.map((group) => (
                    <div key={group.providerId} className="agent-model-group">
                      <div className="agent-model-group-label">{group.providerName}</div>
                      {group.models.map((id) => {
                        const value = `${group.providerId}::${id}`;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={value === modelValue ? "active" : ""}
                            onClick={() => {
                              const parsed = parseModelSwitchKey(value);
                              if (!parsed) return;
                              onSwitchModel(parsed.providerId, parsed.modelId);
                              setModelOpen(false);
                            }}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </Presence>
            </div>

            <button
              type="button"
              className="agent-attach-current"
              disabled={!canAttachCurrent || busy}
              title={canAttachCurrent ? `附加当前文件：${currentPageLabel}` : "当前文件已附加或没有打开文件"}
              onClick={onAttachCurrent}
            >
              <Paperclip size={13} />
              <span>{canAttachCurrent ? currentPageLabel : "当前文件已附加"}</span>
            </button>

            </div>

            <div className="agent-input-row">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy) onSend();
                  }
                }}
                placeholder="发送消息"
                rows={3}
                style={{ height: composerHeight }}
              />
              <div className="agent-input-actions">
                <div className="agent-attachments-wrap">
                  <button
                    type="button"
                    className={`agent-round-btn agent-attachments-btn${attachmentsOpen ? " active" : ""}`}
                    title={attachments.length ? `已附加 ${attachments.length} 个文件` : "附件"}
                    aria-label={attachments.length ? `已附加 ${attachments.length} 个文件` : "附件"}
                    aria-expanded={attachmentsOpen}
                    onClick={() => {
                      setAttachmentsOpen((open) => !open);
                      setUsageOpen(false);
                      setModelOpen(false);
                    }}
                  >
                    <Paperclip size={15} />
                    {attachments.length > 0 && <span className="agent-attachments-count">{attachments.length}</span>}
                  </button>
                  <Presence open={attachmentsOpen} duration={PRESENCE_MS.fast}>
                    <div className="agent-attachments-pop" role="dialog" aria-label="已附加文献">
                      <div className="agent-attachments-pop-head">
                        <strong>已附加文献</strong>
                        <span>{attachments.length} 个</span>
                      </div>
                      {attachments.length > 0 ? (
                        <div className="agent-attachment-list">
                          {attachments.map((attachment) => (
                            <div key={attachment.id} className="agent-attachment-row" title={attachment.id}>
                              <Paperclip size={13} />
                              <span>{attachment.label}</span>
                              <button type="button" aria-label={`移除 ${attachment.label}`} onClick={() => onDetach(attachment.id)}>
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="agent-attachments-empty">当前会话还没有附加文献</p>
                      )}
                      <button
                        type="button"
                        className="agent-attach-pop-action"
                        disabled={!canAttachCurrent || busy}
                        title={canAttachCurrent ? `附加当前文件：${currentPageLabel}` : "当前文件已附加或没有打开文件"}
                        onClick={onAttachCurrent}
                      >
                        <Paperclip size={13} />
                        <span>{canAttachCurrent ? `附加当前文件：${currentPageLabel}` : "没有可附加的当前文件"}</span>
                      </button>
                    </div>
                  </Presence>
                </div>
                <div className="agent-usage-wrap">
                  <button
                    type="button"
                    className="agent-round-btn"
                    data-icon="gauge"
                    title="上下文用量"
                    aria-label="上下文用量"
                    onClick={() => {
                      setUsageOpen((open) => !open);
                      setModelOpen(false);
                    }}
                  >
                    <GaugeGlyph />
                    {usage.totalTokens > 0 && (
                      <span className="agent-usage-badge">{formatTokens(usage.totalTokens)}</span>
                    )}
                  </button>
                  <Presence open={usageOpen} duration={PRESENCE_MS.fast}>
                    <div className="agent-usage-pop">
                      {usage.totalTokens > 0 ? (
                        <>
                          <div>
                            <span>上下文</span>
                            <b>{usage.totalTokens.toLocaleString()}</b>
                          </div>
                          <div>
                            <span>输入</span>
                            <b>{usage.input.toLocaleString()}</b>
                          </div>
                          <div>
                            <span>输出</span>
                            <b>{usage.output.toLocaleString()}</b>
                          </div>
                        </>
                      ) : (
                        <p>暂无用量（发送后统计）</p>
                      )}
                    </div>
                  </Presence>
                </div>
                <button
                  type="button"
                  className={`agent-round-btn agent-send-btn${busy ? " stop" : ""}`}
                  data-icon={busy ? "stop" : "send"}
                  title={busy ? "停止" : "发送"}
                  aria-label={busy ? "停止生成" : "发送"}
                  disabled={!busy && !canSend}
                  onClick={busy ? onStop : onSend}
                >
                  {busy ? (
                    <StopGlyph key="stop" className="send-icon" />
                  ) : (
                    <SendGlyph key="send" className="send-icon" />
                  )}
                </button>
              </div>
            </div>
          </div>
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

function SessionMessageView({
  message,
  pages,
  onOpen,
  ideas,
  ideasVisible,
  sessionId,
  onCreateIdea,
}: {
  message: AgentSessionMessage;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  ideas: Idea[];
  ideasVisible: boolean;
  sessionId: string | null;
  onCreateIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
}) {
  if (message.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="msg-role">你</div>
        <div className="msg-body">
          <WikilinkText text={message.content} pages={pages} onOpen={onOpen} />
        </div>
      </div>
    );
  }

  if (message.role === "toolResult") {
    // Tool traffic is retained for the next model turn, but is not part of the conversation transcript.
    return null;
  }

  const hasText = Boolean(message.content.trim());
  const toolCalls = message.toolCalls ?? [];
  const sources = message.sources ?? [];
  if (!hasText && toolCalls.length === 0 && sources.length === 0) {
    return null;
  }

  return (
    <div className="msg msg-assistant" data-message-id={message.id}>
      <div className="msg-role">Agent</div>
      {hasText && (
        <div className="msg-body">
          <MarkdownPreview
            markdown={message.content}
            pages={pages}
            onOpen={onOpen}
            ideaTarget={{ kind: "assistant", sessionId: sessionId ?? "", messageId: message.id }}
            ideas={ideas.filter((idea) => idea.target.kind === "assistant" && idea.target.sessionId === sessionId && idea.target.messageId === message.id)}
            ideasVisible={ideasVisible}
            onCreateIdea={(selector, content) => onCreateIdea(message.id, selector, content)}
          />
        </div>
      )}
      {sources.length > 0 && (
        <div className="msg-sources">
          {sources.map((src) => (
            <button key={src} type="button" className="source-chip" title={src} onClick={() => onOpen(src)}>
              {pages.find((page) => page.id === src)?.title ?? src.split("/").pop() ?? src}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
