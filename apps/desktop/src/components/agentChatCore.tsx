import { AlertCircle, CheckCircle2, LoaderCircle, Paperclip, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AgentAttachment, AgentSessionMessage, Idea, IdeaSelector, PageSummary } from "../api";
import { parseModelSwitchKey } from "../lib/llmProviders";
import { loadPref, savePref } from "../lib/prefs";
import { attachResizeY } from "../lib/pointerResize";
import { CentaurCharacterView } from "./CentaurCharacterView";
import { MarkdownPreview } from "./MarkdownPreview";
import { Presence } from "./Presence";
import { PRESENCE_MS } from "../lib/usePresence";
import { WikilinkText } from "./WikilinkText";
import { GaugeGlyph, SendGlyph, StopGlyph } from "./iconGlyphs";

const COMPOSER_MIN = 88;
const COMPOSER_MAX = 360;

function clampComposer(n: number): number {
  return Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, Math.round(n)));
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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

export type AgentChatFeedProps = {
  messages: AgentSessionMessage[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string; status: "running" | "done" | "error" }>;
  streamingPhase: "thinking" | "tool" | "answer" | null;
  busy: boolean;
  modelMissing: boolean;
  pages: PageSummary[];
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  sessionId: string | null;
  onCreateIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onOpen: (id: string) => void;
  listRef?: RefObject<HTMLDivElement | null>;
  followOutputRef?: RefObject<boolean>;
  scrollPaused?: boolean;
  welcomeSizePx?: number;
  showWelcomeCharacter?: boolean;
  className?: string;
};

export function AgentChatFeed({
  messages,
  pendingUser,
  streamingText,
  streamingTools,
  streamingPhase,
  busy,
  modelMissing,
  pages,
  ideas,
  ideasVisible,
  onIdeasVisible,
  sessionId,
  onCreateIdea,
  onUpdateIdea,
  onOpen,
  listRef,
  followOutputRef,
  scrollPaused = false,
  welcomeSizePx = 64,
  showWelcomeCharacter = true,
  className,
}: AgentChatFeedProps) {
  const empty = messages.length === 0 && !pendingUser && !busy;

  useEffect(() => {
    const el = listRef?.current;
    if (!el || scrollPaused) return;
    if (followOutputRef?.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingUser, busy, streamingText, streamingTools, listRef, followOutputRef, scrollPaused]);

  return (
    <div
      className={className ?? "agent-chat-view"}
      ref={listRef}
      onScroll={(event) => {
        if (!followOutputRef) return;
        const el = event.currentTarget;
        followOutputRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
      }}
    >
      {empty && (
        <div className="agent-welcome">
          {showWelcomeCharacter && (
            <div className="agent-welcome-icon">
              <CentaurCharacterView sizePx={welcomeSizePx} />
            </div>
          )}
          {modelMissing ? (
            <p>当前没有可用模型。请在设置中填写 API，并拉取或输入模型名。</p>
          ) : (
            <p className="agent-welcome-hi">Hi there!</p>
          )}
        </div>
      )}
      {messages.map((m) => (
        <SessionMessageView
          key={m.id}
          message={m}
          pages={pages}
          ideas={ideas}
          ideasVisible={ideasVisible}
          onIdeasVisible={onIdeasVisible}
          sessionId={sessionId}
          onCreateIdea={onCreateIdea}
          onUpdateIdea={onUpdateIdea}
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
                {streamingTools.length > 0 && (
                  <div className="agent-tool-trace" aria-label="工具执行过程">
                    {streamingTools.map((tool) => (
                      <div className={`agent-tool-step ${tool.status}`} key={tool.id}>
                        {tool.status === "running" ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : tool.status === "error" ? (
                          <AlertCircle size={13} />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        <span>{tool.name}</span>
                        <small>
                          {tool.status === "running" ? "执行中" : tool.status === "error" ? "失败" : "完成"}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
                {streamingText ? (
                  <>
                    <MarkdownPreview markdown={streamingText} pages={pages} onOpen={onOpen} />
                    <span className="stream-cursor" aria-hidden="true" />
                  </>
                ) : (
                  <span className="msg-thinking">
                    {streamingPhase === "tool" || streamingTools.some((tool) => tool.status === "running")
                      ? "正在调用工具"
                      : streamingPhase === "answer"
                        ? "正在组织回答"
                        : "正在分析问题"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type AgentComposerProps = {
  variant: "panel" | "sms";
  draft: string;
  busy: boolean;
  modelMissing: boolean;
  modelLabel: string;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
  messages: AgentSessionMessage[];
  attachments: AgentAttachment[];
  canAttachCurrent: boolean;
  currentPageLabel: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
  onAttachCurrent: () => void;
  onDetach: (id: string) => void;
};

export function AgentComposer({
  variant,
  draft,
  busy,
  modelMissing,
  modelLabel,
  modelValue,
  modelGroups,
  mock,
  messages,
  attachments,
  canAttachCurrent,
  currentPageLabel,
  onDraft,
  onSend,
  onStop,
  onSwitchModel,
  onAttachCurrent,
  onDetach,
}: AgentComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(() =>
    clampComposer(loadPref("agentComposerHeight", COMPOSER_MIN)),
  );

  const usage = useMemo(() => sessionUsage(messages), [messages]);
  const modelName = modelValue.includes("::") ? modelValue.slice(modelValue.indexOf("::") + 2) : modelValue;
  const canSend = Boolean(draft.trim()) && !busy && !modelMissing;
  const minimal = variant === "sms";

  useEffect(() => {
    if (minimal) return;
    savePref("agentComposerHeight", composerHeight);
  }, [composerHeight, minimal]);

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

  if (minimal) {
    return (
      <div className="agent-composer-sms">
        <div className="agent-model-wrap agent-composer-sms-model">
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
        <div className="agent-composer-sms-bar">
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
            placeholder="发消息…"
            rows={1}
          />
          <button
            type="button"
            className={`agent-composer-sms-send${busy ? " stop" : ""}`}
            data-icon={busy ? "stop" : "send"}
            title={busy ? "停止" : "发送"}
            aria-label={busy ? "停止生成" : "发送"}
            disabled={!busy && !canSend}
            onClick={busy ? onStop : onSend}
          >
            {busy ? <StopGlyph className="send-icon" /> : <SendGlyph className="send-icon" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-input-panel">
      <div
        className="composer-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整输入框高度"
        title="拖拽调整输入框高度"
        onPointerDown={(e) => attachResizeY(e, (dy) => setComposerHeight((h) => clampComposer(h - dy)))}
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
              {usage.totalTokens > 0 && <span className="agent-usage-badge">{formatTokens(usage.totalTokens)}</span>}
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
            {busy ? <StopGlyph key="stop" className="send-icon" /> : <SendGlyph key="send" className="send-icon" />}
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
  ideas,
  ideasVisible,
  onIdeasVisible,
  sessionId,
  onCreateIdea,
  onUpdateIdea,
}: {
  message: AgentSessionMessage;
  pages: PageSummary[];
  onOpen: (id: string) => void;
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  sessionId: string | null;
  onCreateIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
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
      <details className={`agent-tool-result${message.isError ? " error" : ""}`}>
        <summary>
          {message.isError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
          <span>{message.toolName}</span>
          <small>{message.isError ? "失败" : "完成"}</small>
        </summary>
        <pre>{message.content}</pre>
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
    <div className="msg msg-assistant" data-message-id={message.id}>
      <div className="msg-role">Agent</div>
      {hasText && (
        <div className="msg-body">
          <MarkdownPreview
            markdown={message.content}
            pages={pages}
            onOpen={onOpen}
            ideaTarget={{ kind: "assistant", sessionId: sessionId ?? "", messageId: message.id }}
            ideas={ideas.filter(
              (idea) =>
                idea.target.kind === "assistant" &&
                idea.target.sessionId === sessionId &&
                idea.target.messageId === message.id,
            )}
            ideasVisible={ideasVisible}
            onIdeasVisible={onIdeasVisible}
            onCreateIdea={(selector, content) => onCreateIdea(message.id, selector, content)}
            onUpdateIdea={onUpdateIdea}
          />
        </div>
      )}
      {toolCalls.length > 0 && (
        <div className="msg-tools">
          {toolCalls.map((tool) => (
            <span className="tool-chip" key={tool.id}>
              <Wrench size={12} />
              {tool.name}
            </span>
          ))}
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
