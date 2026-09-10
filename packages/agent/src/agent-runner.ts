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
   * Initialize storage.
   */
  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Create a new session.
   */
  async createSession(options: CreateSessionOptions = {}): Promise<AgentSession> {
    const now = new Date().toISOString();
    
    // Determine default model based on available models
    let defaultModel = options.model || { provider: "openai", modelId: "gpt-4o-mini" };
    
    // Check if model is available, fallback to first available if not
    const availableModels = this.models.getModels();
    if (availableModels.length > 0) {
      const modelExists = this.models.getModel(defaultModel.provider, defaultModel.modelId);
      if (!modelExists) {
        // Use first available model
        defaultModel = {
          provider: availableModels[0].provider,
          modelId: availableModels[0].id,
        };
      }
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

    // Get model from Models collection
    const model = this.models.getModel(session.model.provider, session.model.modelId);
    if (!model) {
      throw new Error(`Model not found: ${session.model.provider}/${session.model.modelId}`);
    }

    // Initialize agent with session history
    const agent = new Agent({
      initialState: {
        systemPrompt: fullSystemPrompt,
        model,
        tools,
        messages: this.convertToAgentMessages(session.messages),
      },
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
    await agent.prompt(message);

    // Extract assistant response
    const lastMessage = agent.state.messages[agent.state.messages.length - 1];
    let answer = "";
    if (lastMessage?.role === "assistant") {
      // Extract text content from assistant message
      if (Array.isArray(lastMessage.content)) {
        answer = lastMessage.content
          .map((c: any) => (c.type === "text" ? c.text : ""))
          .filter(Boolean)
          .join("");
      } else if (typeof lastMessage.content === "string") {
        answer = lastMessage.content;
      }
    }

    // If still no answer, provide a fallback
    if (!answer) {
      answer = "Agent 执行完成，但未返回文本响应。";
    }

    // Update session
    session.messages.push({
      role: "user",
      content: message,
      timestamp: Date.now(),
    });

    session.messages.push({
      role: "assistant",
      content: answer,
      timestamp: Date.now(),
      provider: session.model.provider,
      model: session.model.modelId,
      sources: Array.from(sources),
    });

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
      } else {
        return {
          role: "assistant",
          content: [{ type: "text", text: msg.content }],
          provider: msg.provider,
          model: msg.model,
          timestamp: msg.timestamp,
          stopReason: "end_turn",
        };
      }
    });
  }
}
