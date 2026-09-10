import { useEffect, useRef, useState } from "react";
import type { AgentSessionMessage, PageSummary } from "../api";
import { loadPref, savePref } from "../lib/prefs";
import { attachResizeY } from "../lib/pointerResize";
import { WikilinkText } from "./WikilinkText";

type AgentPaneProps = {
  messages: AgentSessionMessage[];
  linkedPageIds: string[];
  pendingUser: string | null;
  draft: string;
  busy: boolean;
  pages: PageSummary[];
  modelLabel: string;
  modelMissing: boolean;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
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
  draft,
  busy,
  pages,
  modelLabel,
  modelMissing,
  modelValue,
  modelGroups,
  mock,
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
  }, [messages, pendingUser, busy]);

  const empty = messages.length === 0 && !pendingUser;

  return (
    <div className="agent-pane">
      <div className={`agent-model-bar${modelMissing ? " agent-model-bar-warn" : ""}`}>
        {mock || modelGroups.length === 0 ? (
          <span>{modelLabel}</span>
        ) : (
          <label className="agent-model-select">
            <span>模型</span>
            <select
              value={modelValue}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                const sep = value.indexOf("::");
                if (sep <= 0) return;
                onSwitchModel(value.slice(0, sep), value.slice(sep + 2));
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
          </label>
        )}
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
          <div className="msg msg-system">
            <div className="msg-role">Agent</div>
            <div className="msg-body">正在查询知识库…</div>
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
