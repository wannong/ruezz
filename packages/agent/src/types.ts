import type { AskResult, WikiEngine } from "@wikihome/engine-api";

/**
 * Agent session message.
 * Compatible with Pi agent-core AgentMessage but simplified for WikiHome.
 */
export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Provider name (only for assistant messages) */
  provider?: string;
  /** Model ID (only for assistant messages) */
  model?: string;
  /** Tool calls made in this message */
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  /** Sources referenced (page IDs) */
  sources?: string[];
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

/**
 * Context for building transformContext.
 */
export interface ContextBuildOptions {
  /** Current page ID being viewed */
  currentPageId?: string;
  /** Number of graph hops to include neighbors (default: 1) */
  graphDepth?: number;
  /** Additional search keywords */
  searchQuery?: string;
}
