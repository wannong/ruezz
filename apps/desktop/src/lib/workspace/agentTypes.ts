import type { AgentAttachment, AgentSessionMessage } from "../../api";

export type AgentUiState = {
  messages: AgentSessionMessage[];
  attachments: AgentAttachment[];
  pendingUser: string | null;
  streamingText: string;
  streamingTools: Array<{ id: string; name: string; status: "running" | "done" | "error" }>;
  streamingPhase: "thinking" | "tool" | "answer" | null;
  draft: string;
  busy: boolean;
};

export const emptyAgentState = (): AgentUiState => ({
  messages: [],
  attachments: [],
  pendingUser: null,
  streamingText: "",
  streamingTools: [],
  streamingPhase: null,
  draft: "",
  busy: false,
});
