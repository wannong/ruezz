import type { AskResult, WikiEngine } from "@wikihome/engine-api";

/**
 * Agent session message.
 * Supports user messages, assistant messages with tool calls, and tool result messages.
 */
export type SessionMessage =
  | {
      id: string;
      role: "user";
      content: string;
      timestamp: number;
    }
  | {
      id: string;
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
      usage?: {
        input: number;
        output: number;
        totalTokens: number;
      };
    }
  | {
      id: string;
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: string;
      isError: boolean;
      timestamp: number;
    };

export interface AgentAttachment {
  id: string;
  kind: "page" | "source";
  label: string;
  path?: string;
  attachedAt: string;
}

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
  attachments: AgentAttachment[];
  /** Hidden from the main session list when true */
  archived?: boolean;
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
  attachments: AgentAttachment[];
  archived?: boolean;
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
  /** Graph hops around the current page. 0 = current page id only; 1–3 = neighbor IDs, no bodies. */
  graphDepth?: number;
}

/** Live events while `prompt()` is running. */
export type AgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "phase"; phase: "thinking" | "tool" | "answer" }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_end"; name: string; id: string; isError?: boolean }
  | { type: "usage"; input: number; output: number; totalTokens: number };
