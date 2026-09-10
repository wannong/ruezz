import { ArrowUp, Gauge, History, Plus, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSessionMessage, AgentSessionSummary, PageSummary } from "../api";
import wikihomeIcon from "../assets/wikihome-icon.svg";
import { parseModelSwitchKey } from "../lib/llmProviders";
import { loadPref, savePref } from "../lib/prefs";
import { attachResizeY } from "../lib/pointerResize";
import { MarkdownPreview } from "./MarkdownPreview";
import { WikilinkText } from "./WikilinkText";

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
  draft: string;
  busy: boolean;
  pages: PageSummary[];
  sessions: AgentSessionSummary[];
  sessionId: string | null;
  modelLabel: string;
  modelMissing: boolean;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpen: (id: string) => void;
};

function messageKey(message: AgentSessionMessage, index: number): string {
  if (message.role === "toolResult") {
    return `${index}-tool-${message.toolCallId}`;
  }
  return `${index}-${message.role}-${message.timestamp}`;
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
  draft,
  busy,
  pages,
  sessions,
  sessionId,
  modelLabel,
  modelMissing,
  modelValue,
  modelGroups,
  mock,
  onNewChat,
  onSelectSession,
  onSwitchModel,
  onDraft,
  onSend,
  onStop,
  onOpen,
}: AgentPaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(() =>
    clampComposer(loadPref("agentComposerHeight", COMPOSER_MIN)),
  );

  const empty = messages.length === 0 && !pendingUser && !busy;
  const usage = useMemo(() => sessionUsage(messages), [messages]);
  const modelName = modelValue.includes("::") ? modelValue.slice(modelValue.indexOf("::") + 2) : modelValue;
  const canSend = Boolean(draft.trim()) && !busy && !modelMissing;

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
        <button
          type="button"
          className={`agent-round-btn${historyOpen ? " active" : ""}`}
          title="会话记录"
          aria-label="会话记录"
          onClick={() => {
            setHistoryOpen((open) => !open);
            setModelOpen(false);
            setUsageOpen(false);
          }}
        >
          <History size={16} />
        </button>
        <button
          type="button"
          className="agent-round-btn"
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
        {historyOpen && (
          <div className="agent-session-sheet" role="dialog" aria-label="会话记录">
            <div className="agent-session-sheet-head">
              <span>会话</span>
            </div>
            <div className="agent-session-list">
              {sessions.length === 0 && <div className="agent-session-empty">还没有对话</div>}
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`agent-session-item${session.id === sessionId ? " active" : ""}`}
                  disabled={busy && session.id !== sessionId}
                  onClick={() => {
                    onSelectSession(session.id);
                    setHistoryOpen(false);
                  }}
                >
                  <span className="agent-session-title">{session.title || "新对话"}</span>
                  <span className="agent-session-meta">{formatSessionTime(session.updatedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="agent-chat-view" ref={listRef}>
            {empty && (
              <div className="agent-welcome">
                <div className="agent-welcome-icon">
                  <img src={wikihomeIcon} alt="" width={64} height={64} />
                </div>
                {modelMissing ? (
                  <p>当前没有可用模型。请在设置中填写 API，并拉取或输入模型名。</p>
                ) : (
                  <p className="agent-welcome-hi">Hi there!</p>
                )}
              </div>
            )}
            {messages.map((m, index) => (
              <SessionMessageView key={messageKey(m, index)} message={m} pages={pages} onOpen={onOpen} />
            ))}
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
                    <MarkdownPreview markdown={streamingText} pages={pages} onOpen={onOpen} />
                  ) : (
                    <span className="msg-thinking">思考中</span>
                  )}
                </div>
                {streamingTools.length > 0 && (
                  <div className="msg-tools">
                    {streamingTools.map((tool) => (
                      <span key={tool.id} className="tool-chip">
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
              {modelOpen && modelGroups.length > 0 && (
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
              )}
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
                <div className="agent-usage-wrap">
                  <button
                    type="button"
                    className="agent-round-btn"
                    title="上下文用量"
                    aria-label="上下文用量"
                    onClick={() => {
                      setUsageOpen((open) => !open);
                      setModelOpen(false);
                    }}
                  >
                    <Gauge size={16} />
                    {usage.totalTokens > 0 && (
                      <span className="agent-usage-badge">{formatTokens(usage.totalTokens)}</span>
                    )}
                  </button>
                  {usageOpen && (
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
                  )}
                </div>
                {busy ? (
                  <button
                    type="button"
                    className="agent-round-btn agent-send-btn stop"
                    title="停止"
                    aria-label="停止生成"
                    onClick={onStop}
                  >
                    <Square size={13} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="agent-round-btn agent-send-btn"
                    title="发送"
                    aria-label="发送"
                    disabled={!canSend}
                    onClick={onSend}
                  >
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
    </div>
  );
}

function SessionMessageView({
  message,
  pages,
  onOpen,
}: {
  message: AgentSessionMessage;
  pages: PageSummary[];
  onOpen: (id: string) => void;
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
    return (
      <details className={`msg msg-tool${message.isError ? " msg-tool-error" : ""}`}>
        <summary className="msg-role">
          {message.isError ? "工具失败" : "工具"} · {message.toolName}
        </summary>
        <div className="msg-body">
          <WikilinkText text={message.content} pages={pages} onOpen={onOpen} />
        </div>
      </details>
    );
  }

  const hasText = Boolean(message.content.trim());
  const toolCalls = message.toolCalls ?? [];
  const sources = message.sources ?? [];
  if (!hasText && toolCalls.length === 0 && sources.length === 0) {
    return null;
  }

  return (
    <div className="msg msg-assistant">
      <div className="msg-role">Agent</div>
      {hasText && (
        <div className="msg-body">
          <MarkdownPreview markdown={message.content} pages={pages} onOpen={onOpen} />
        </div>
      )}
      {toolCalls.length > 0 && (
        <div className="msg-tools">
          {toolCalls.map((call) => (
            <span key={call.id} className="tool-chip">
              {call.name}
            </span>
          ))}
        </div>
      )}
      {sources.length > 0 && (
        <div className="msg-sources">
          {sources.map((src) => (
            <button key={src} type="button" className="source-chip" onClick={() => onOpen(src)}>
              {src}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
