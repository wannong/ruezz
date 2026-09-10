import type { AskResult, WikiEngine } from "@wikihome/engine-api";

/**
 * Agent session message.
 * Supports user messages, assistant messages with tool calls, and tool result messages.
 */
export type SessionMessage =
  | {
      role: "user";
      content: string;
      timestamp: number;
    }
  | {
      role: "assistant";
      content: string;
      timestamp: number;
      provider?: string;
      model?: string;
      toolCalls?: Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
      }>;
      sources?: string[];
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: string;
      isError: boolean;
      timestamp: number;
    };

/**
 * Agent session state persisted to disk.
 */
export interface AgentSession {
  /** Unique session identifier */
  id: string;
  /** Human-readable title (auto-generated or user-provided) */
  title: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Current model configuration */
  model: {
    provider: string;
    modelId: string;
  };
  /** Wiki pages linked to this session (current page ∪ tool-accessed pages) */
  linkedPageIds: string[];
  /** Conversation history */
  messages: SessionMessage[];
}

/**
 * Summary metadata for listing sessions.
 */
export interface AgentSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: {
    provider: string;
    modelId: string;
  };
  messageCount: number;
  linkedPageIds: string[];
}

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  title?: string;
  model?: {
    provider: string;
    modelId: string;
  };
  currentPageId?: string;
}

/**
 * Result of a prompt execution with agent tools.
 */
export interface AgentPromptResult {
  answer: string;
  sources: string[];
  linkedPageIds: string[];
  toolsUsed: string[];
  session: AgentSession;
}

/** Per-turn UI state passed into a prompt (not wiki body). */
export interface ContextBuildOptions {
  /** Page currently open in the editor, if any */
  currentPageId?: string;
}
