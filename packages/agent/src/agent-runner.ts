import { Agent } from "@earendil-works/pi-agent-core";
import type { Models } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";
import { buildAgentContext } from "./context-builder.js";
import { SessionStorage } from "./session-storage.js";
import { createWikiTools } from "./tools/index.js";
import type {
  AgentPromptResult,
  AgentSession,
  ContextBuildOptions,
  CreateSessionOptions,
  SessionMessage,
} from "./types.js";

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const SYSTEM_PROMPT = `你是 WikiHome 本地知识库助手。你可以使用以下工具访问和修改用户的 wiki：

- search_pages：搜索页面
- read_page：读取页面内容
- write_page：写入或更新页面
- create_page：创建新页面
- list_pages：列出所有页面
- get_graph：获取知识图谱
- get_backlinks：获取反向链接
- ingest_text：入库文本内容
- ingest_file：入库文件

引用页面时使用 [[page-id]] 格式。所有写入操作必须在 wiki/ 目录内。

请根据用户的问题，使用合适的工具完成任务。`;

/**
 * Agent runner that manages sessions and executes prompts using Pi agent-core.
 */
export class AgentRunner {
  private storage: SessionStorage;
  private engine: WikiEngine;
  private vaultRoot: string;
  private models: Models;

  constructor(engine: WikiEngine, vaultRoot: string, models: Models) {
    this.engine = engine;
    this.vaultRoot = vaultRoot;
    this.models = models;
    this.storage = new SessionStorage(vaultRoot);
  }

  /**
   * Get available models from Models collection.
   */
  getModels() {
    return this.models.getModels();
  }

  /**
   * Initialize storage.
   */
  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Map a session's stored provider/id onto the current catalog.
   * Exact match, then same model id on another provider, then the first model.
   */
  private resolveSessionModel(wanted?: { provider: string; modelId: string }): {
    provider: string;
    modelId: string;
  } | null {
    const available = this.models.getModels();
    if (available.length === 0) return null;
    if (wanted) {
      const exact = this.models.getModel(wanted.provider, wanted.modelId);
      if (exact) return { provider: exact.provider, modelId: exact.id };
      const byId = available.find((model) => model.id === wanted.modelId);
      if (byId) return { provider: byId.provider, modelId: byId.id };
    }
    const first = available[0];
    return { provider: first.provider, modelId: first.id };
  }

  /**
   * Create a new session.
   */
  async createSession(options: CreateSessionOptions = {}): Promise<AgentSession> {
    const now = new Date().toISOString();
    const defaultModel = this.resolveSessionModel(options.model);
    if (!defaultModel) {
      throw new Error("当前没有可用模型。请在设置中填写 API 并拉取模型。");
    }

    const session: AgentSession = {
      id: this.storage.generateId(),
      title: options.title || "新对话",
      createdAt: now,
      updatedAt: now,
      model: defaultModel,
      linkedPageIds: options.currentPageId ? [options.currentPageId] : [],
      messages: [],
    };
    await this.storage.save(session);
    return session;
  }

  /**
   * Generate a short title from the first user message.
   */
  private generateTitle(message: string): string {
    // Take first 50 chars, truncate at word boundary
    const trimmed = message.trim().slice(0, 50);
    const lastSpace = trimmed.lastIndexOf(" ");
    return lastSpace > 20 ? trimmed.slice(0, lastSpace) + "..." : trimmed + (message.length > 50 ? "..." : "");
  }

  /**
   * Get an existing session.
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    return this.storage.load(sessionId);
  }

  /**
   * List all sessions.
   */
  async listSessions() {
    return this.storage.list();
  }

  /**
   * Delete a session.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.storage.delete(sessionId);
  }

  /**
   * Execute a prompt within a session.
   */
  async prompt(
    sessionId: string,
    message: string,
    contextOptions?: ContextBuildOptions,
  ): Promise<AgentPromptResult> {
    const session = await this.storage.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Build context
    const contextInfo = await buildAgentContext(this.engine, this.vaultRoot, contextOptions);
    const fullSystemPrompt = contextInfo ? `${SYSTEM_PROMPT}\n\n${contextInfo}` : SYSTEM_PROMPT;

    // Create tools
    const tools = createWikiTools(this.engine, this.vaultRoot);

    const resolved = this.resolveSessionModel(session.model);
    if (!resolved) {
      throw new Error("当前没有可用模型。请在设置中填写 API 并拉取模型。");
    }
    if (
      resolved.provider !== session.model.provider ||
      resolved.modelId !== session.model.modelId
    ) {
      session.model = resolved;
      await this.storage.save(session);
    }
    const model = this.models.getModel(resolved.provider, resolved.modelId);
    if (!model) {
      throw new Error("当前没有可用模型。请在设置中填写 API 并拉取模型。");
    }

    // Initialize agent with session history. Stream through the Models
    // collection so mock faux / settings-backed providers are used (not the
    // global pi-ai compat registry).
    const agent = new Agent({
      initialState: {
        systemPrompt: fullSystemPrompt,
        model,
        tools,
        messages: this.convertToAgentMessages(session.messages),
      },
      streamFn: (streamModel, context, options) =>
        this.models.streamSimple(streamModel, context, options),
    });

    // Track tools used and sources
    const toolsUsed = new Set<string>();
    const sources = new Set<string>();

    agent.subscribe((event) => {
      if (event.type === "tool_execution_end") {
        toolsUsed.add(event.toolName);
        // Extract sources from tool result details
        const details = event.result.details as any;
        if (details?.pageId) {
          sources.add(details.pageId);
        }
        if (details?.results) {
          for (const r of details.results) {
            if (r.id) sources.add(r.id);
          }
        }
        if (details?.pages) {
          for (const p of details.pages) {
            if (p.id) sources.add(p.id);
          }
        }
      }
    });

    // Execute prompt
    try {
      await agent.prompt(message);
    } catch (err) {
      // Let Pi errors propagate to RPC layer
      throw new Error(`Agent execution failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((msg) => msg.role === "assistant");
    if (
      lastAssistant?.role === "assistant" &&
      (lastAssistant.stopReason === "error" || lastAssistant.stopReason === "aborted")
    ) {
      throw new Error(
        lastAssistant.errorMessage || agent.state.errorMessage || "Agent execution failed",
      );
    }
    if (agent.state.errorMessage) {
      throw new Error(`Agent execution failed: ${agent.state.errorMessage}`);
    }

    // Extract assistant response and collect all messages from this turn
    const newMessages = agent.state.messages.slice(this.convertToAgentMessages(session.messages).length);
    
    let answer = "";
    const turnMessages: SessionMessage[] = [];
    
    // Add user message
    turnMessages.push({
      role: "user",
      content: message,
      timestamp: Date.now(),
    });
    
    // Process all new messages from Pi Agent
    for (const msg of newMessages) {
      if (msg.role === "assistant") {
        // Extract text content
        const textContent = Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
          : typeof msg.content === "string"
            ? msg.content
            : "";
        
        if (textContent) {
          answer = textContent;
        }
        
        // Extract tool calls
        const toolCalls = Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "toolCall")
              .map((c: any) => ({
                id: c.id,
                name: c.name,
                args: (c.arguments ?? c.args ?? {}) as Record<string, unknown>,
              }))
          : [];
        
        turnMessages.push({
          role: "assistant",
          content: textContent,
          timestamp: Date.now(),
          provider: session.model.provider,
          model: session.model.modelId,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          sources: Array.from(sources),
        });
      } else if (msg.role === "toolResult") {
        // Add tool result message
        const resultContent = Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
          : typeof msg.content === "string"
            ? msg.content
            : "";
        
        turnMessages.push({
          role: "toolResult",
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          content: resultContent,
          isError: msg.isError || false,
          timestamp: Date.now(),
        });
      }
    }

    // If no answer after successful execution, that's unexpected but not an error
    if (!answer) {
      answer = "（Agent 未返回文本响应）";
    }

    // Update session with all turn messages
    session.messages.push(...turnMessages);

    // Auto-generate title from first user message if still default
    if (session.title === "新对话" && session.messages.length >= 1) {
      const firstUserMsg = session.messages.find((m) => m.role === "user");
      if (firstUserMsg?.role === "user") {
        session.title = this.generateTitle(firstUserMsg.content);
      }
    }

    // Update linked pages
    const allLinkedPages = new Set(session.linkedPageIds);
    if (contextOptions?.currentPageId) {
      allLinkedPages.add(contextOptions.currentPageId);
    }
    sources.forEach((s) => allLinkedPages.add(s));
    session.linkedPageIds = Array.from(allLinkedPages);

    session.updatedAt = new Date().toISOString();
    await this.storage.save(session);

    return {
      answer,
      sources: Array.from(sources),
      linkedPageIds: session.linkedPageIds,
      toolsUsed: Array.from(toolsUsed),
      session,
    };
  }

  /**
   * Set the model for a session.
   */
  async setModel(
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<AgentSession | null> {
    const session = await this.storage.load(sessionId);
    if (!session) return null;

    session.model = { provider, modelId };
    session.updatedAt = new Date().toISOString();
    await this.storage.save(session);
    return session;
  }

  /**
   * Convert session messages to Pi agent-core format.
   */
  private convertToAgentMessages(messages: SessionMessage[]): any[] {
    return messages.map((msg) => {
      if (msg.role === "user") {
        return {
          role: "user",
          content: [{ type: "text", text: msg.content }],
          timestamp: msg.timestamp,
        };
      } else if (msg.role === "assistant") {
        const content: any[] = [{ type: "text", text: msg.content }];
        
        // Add tool calls if present
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "toolCall",
              id: tc.id,
              name: tc.name,
              arguments: tc.args,
            });
          }
        }
        
        return {
          role: "assistant",
          content,
          api: "openai-completions",
          provider: msg.provider || "openai-compatible",
          model: msg.model || "unknown",
          timestamp: msg.timestamp,
          stopReason: msg.toolCalls && msg.toolCalls.length > 0 ? "toolUse" : "stop",
          // Pi streamSimple estimates context from assistant.usage.totalTokens.
          // Older session JSON omitted usage; missing it crashes real (non-mock) calls.
          usage: EMPTY_USAGE,
        };
      } else if (msg.role === "toolResult") {
        return {
          role: "toolResult",
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          content: [{ type: "text", text: msg.content }],
          isError: msg.isError,
          timestamp: msg.timestamp,
        };
      }
      return msg;
    });
  }
}
