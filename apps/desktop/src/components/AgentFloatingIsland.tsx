import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentAttachment, AgentSessionMessage, Idea, IdeaSelector, PageSummary } from "../api";
import { AgentChatFeed, AgentComposer } from "./agentChatCore";
import { Presence } from "./Presence";

export type AgentFloatingIslandProps = {
  open: boolean;
  onClose: () => void;
  messages: AgentSessionMessage[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string; status: "running" | "done" | "error" }>;
  streamingPhase: "thinking" | "tool" | "answer" | null;
  draft: string;
  busy: boolean;
  modelMissing: boolean;
  modelLabel: string;
  modelValue: string;
  modelGroups: Array<{ providerId: string; providerName: string; models: string[] }>;
  mock: boolean;
  pages: PageSummary[];
  ideas: Idea[];
  ideasVisible: boolean;
  onIdeasVisible: (visible: boolean) => void;
  sessionId: string | null;
  onCreateIdea: (messageId: string, selector: IdeaSelector, content: string) => Promise<boolean>;
  onUpdateIdea: (id: string, patch: Partial<Pick<Idea, "content" | "status">>) => Promise<void>;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpen: (id: string) => void;
  onSwitchModel: (providerId: string, modelId: string) => void;
  attachments: AgentAttachment[];
  canAttachCurrent: boolean;
  currentPageLabel: string;
  onAttachCurrent: () => void;
  onDetach: (id: string) => void;
};

export function AgentFloatingIsland({
  open,
  onClose,
  messages,
  pendingUser,
  streamingText,
  streamingTools,
  streamingPhase,
  draft,
  busy,
  modelMissing,
  modelLabel,
  modelValue,
  modelGroups,
  mock,
  pages,
  ideas,
  ideasVisible,
  onIdeasVisible,
  sessionId,
  onCreateIdea,
  onUpdateIdea,
  onDraft,
  onSend,
  onStop,
  onOpen,
  onSwitchModel,
  attachments,
  canAttachCurrent,
  currentPageLabel,
  onAttachCurrent,
  onDetach,
}: AgentFloatingIslandProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (shellRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(".titlebar-centaur-btn")) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  return (
    <>
      <Presence open={open}>
        <button
          type="button"
          className="agent-island-backdrop"
          aria-label="关闭对话"
          onClick={onClose}
        />
      </Presence>
      <Presence open={open}>
        <div
          ref={shellRef}
          className="agent-island"
          role="dialog"
          aria-label="Agent 对话"
          data-open={open ? "true" : "false"}
        >
          <div className="agent-island-head">
            <span className="agent-island-head-title">Agent</span>
            <button type="button" className="agent-island-close" aria-label="关闭" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          <AgentChatFeed
            showWelcomeCharacter={false}
            listRef={listRef}
            followOutputRef={followOutput}
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
            welcomeSizePx={48}
            className="agent-chat-view agent-island-chat"
          />
          <AgentComposer
            variant="sms"
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
      </Presence>
    </>
  );
}
