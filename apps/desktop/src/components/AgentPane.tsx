import { useEffect, useState } from "react";
import type { PageSummary } from "../api";
import { loadPref, savePref } from "../lib/prefs";
import { attachResizeY } from "../lib/pointerResize";
import { WikilinkText } from "./WikilinkText";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: string[];
};

type AgentPaneProps = {
  messages: ChatMessage[];
  draft: string;
  busy: boolean;
  pages: PageSummary[];
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

export function AgentPane({
  messages,
  draft,
  busy,
  pages,
  onDraft,
  onSend,
  onOpen,
}: AgentPaneProps) {
  const [composerHeight, setComposerHeight] = useState(() =>
    clampComposer(loadPref("composerHeight", COMPOSER_DEFAULT)),
  );

  useEffect(() => {
    savePref("composerHeight", composerHeight);
  }, [composerHeight]);

  return (
    <div className="agent-pane">
      <div className="message-list">
        {messages.length === 0 && (
          <div className="empty-center subtle">向 Agent 提问，答案会出现在这里</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-role">
              {m.role === "user" ? "你" : m.role === "assistant" ? "Agent" : "系统"}
            </div>
            <div className="msg-body">
              <WikilinkText text={m.content} pages={pages} onOpen={onOpen} />
            </div>
            {m.sources && m.sources.length > 0 && (
              <div className="msg-sources">
                {m.sources.map((src) => (
                  <button key={src} type="button" className="source-chip" onClick={() => onOpen(src)}>
                    {src}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
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
