import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentSessionMessage, AgentSessionSummary, PageSummary } from "../api";
import { loadPref, savePref } from "../lib/prefs";
import { attachResizeY } from "../lib/pointerResize";
import { parseModelSwitchKey } from "../lib/llmProviders";
import { WikilinkText } from "./WikilinkText";

type AgentPaneProps = {
  messages: AgentSessionMessage[];
  linkedPageIds: string[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string }>;
  draft: string;
  busy: boolean;
  pages: PageSummary[];
  sessions: AgentSessionSummary[];
  sessionId: string | null;
  filterLinked: boolean;
  filterDisabled: boolean;
  graphDepth: number;
  modelLabel: string;
  modelMissing: boolean;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onFilterLinked: (value: boolean) => void;
  onGraphDepth: (depth: number) => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onOpen: (id: string) => void;
};

const COMPOSER_MIN = 72;
const COMPOSER_MAX = 360;
const COMPOSER_DEFAULT = 108;

function clampComposer(n: number): number {
  return Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, n));
}

function messageKey(message: AgentSessionMessage, index: number): string {
  if (message.role === "toolResult") {
    return `${index}-tool-${message.toolCallId}`;
  }
  return `${index}-${message.role}-${message.timestamp}`;
}

export function AgentPane({
  messages,
  linkedPageIds,
  pendingUser,
  streamingText,
  streamingTools,
  draft,
  busy,
  pages,
  sessions,
  sessionId,
  filterLinked,
  filterDisabled,
  graphDepth,
  modelLabel,
  modelMissing,
  modelValue,
  modelGroups,
  mock,
  onNewChat,
  onSelectSession,
  onFilterLinked,
  onGraphDepth,
  onSwitchModel,
  onDraft,
  onSend,
  onOpen,
}: AgentPaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(() =>
    clampComposer(loadPref("composerHeight", COMPOSER_DEFAULT)),
  );

  useEffect(() => {
    savePref("composerHeight", composerHeight);
  }, [composerHeight]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingUser, busy, streamingText, streamingTools]);

  const empty = messages.length === 0 && !pendingUser && !busy;

  return (
    <div className="agent-pane">
      <div className={`agent-toolbar${modelMissing ? " agent-model-bar-warn" : ""}`}>
        <button
          type="button"
          className="agent-toolbar-btn"
          title="新对话"
          aria-label="新对话"
          disabled={busy}
          onClick={onNewChat}
        >
          <Plus size={14} />
        </button>
        <select
          className="agent-toolbar-session"
          value={sessionId ?? ""}
          disabled={busy || sessions.length === 0}
          title="对话"
          onChange={(e) => {
            if (e.target.value) onSelectSession(e.target.value);
          }}
        >
          {sessions.length === 0 && <option value="">无对话</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title || "新对话"}
            </option>
          ))}
        </select>
        <label className="agent-filter" title="只看关联当前笔记的对话">
          <input
            type="checkbox"
            checked={filterLinked}
            disabled={busy || filterDisabled}
            onChange={(e) => onFilterLinked(e.target.checked)}
          />
          关联
        </label>
        {mock || modelGroups.length === 0 ? (
          <span className="agent-toolbar-label" title={modelLabel}>
            {modelLabel}
          </span>
        ) : (
          <select
            className="agent-toolbar-model"
            value={modelValue}
            disabled={busy}
            title="模型"
            onChange={(e) => {
              const parsed = parseModelSwitchKey(e.target.value);
              if (!parsed) return;
              onSwitchModel(parsed.providerId, parsed.modelId);
            }}
          >
            {modelGroups.map((group) => (
              <optgroup key={group.providerId} label={group.providerName}>
                {group.models.map((id) => (
                  <option key={`${group.providerId}::${id}`} value={`${group.providerId}::${id}`}>
                    {id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <select
          className="agent-toolbar-hops"
          value={String(graphDepth)}
          disabled={busy}
          title="图谱跳数"
          onChange={(e) => onGraphDepth(Number(e.target.value))}
        >
          <option value="0">0 跳</option>
          <option value="1">1 跳</option>
          <option value="2">2 跳</option>
          <option value="3">3 跳</option>
        </select>
      </div>
      <div className="message-list" ref={listRef}>
        {empty && (
          <div className="empty-center subtle">
            {modelMissing ? "当前没有可用模型。请在设置中填写 API，并拉取或输入模型名。" : "向 Agent 提问，答案会出现在这里"}
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
                <WikilinkText text={streamingText} pages={pages} onOpen={onOpen} />
              ) : (
                "正在查询知识库…"
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
      {linkedPageIds.length > 0 && (
        <div className="agent-linked" aria-label="相关页面">
          {linkedPageIds.map((id) => (
            <button key={id} type="button" className="source-chip" onClick={() => onOpen(id)}>
              {id}
            </button>
          ))}
        </div>
      )}
      <div className="agent-composer">
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
        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          disabled={busy}
          style={{ height: composerHeight }}
        />
        <div className="composer-actions">
          <button className="primary" type="button" disabled={busy || !draft.trim()} onClick={onSend}>
            {busy ? "发送中…" : "发送"}
          </button>
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
          <WikilinkText text={message.content} pages={pages} onOpen={onOpen} />
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
