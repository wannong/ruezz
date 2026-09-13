import { Agent } from "@earendil-works/pi-agent-core";
import type { Models } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";
import { collectNeighborIds } from "./neighbors.js";
import { SessionStorage } from "./session-storage.js";
import {
  formatSkillsForPrompt,
  loadBundledSkills,
  selectSkillsForMessage,
  type AgentSkill,
} from "./skills.js";
import { createWikiTools } from "./tools/index.js";
import type {
  AgentPromptResult,
  AgentAttachment,
  AgentSession,
  AgentStreamEvent,
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

const SYSTEM_PROMPT = `你是 WikiHome 本地知识库助手。对话里不会预先放入页面正文；需要知识库内容时，请主动调用工具：

- search_pages：搜索页面
- read_page：读取页面内容
- write_page：写入或更新页面
- create_page：创建新页面
- list_pages：列出所有页面
- get_graph：获取知识图谱
- get_backlinks：获取反向链接
- ingest_text：把文本整篇入库为 wiki/sources 一页（不拆页）
- ingest_file：归档原件；Markdown 整篇入库；PDF/Office 先转成一篇 Markdown 再入库（不拆页）
- convert_to_markdown：只把 PDF（pdf2md-layout）/ Word / PPT / Excel（MarkItDown）转成一篇 Markdown，不写入 wiki 页

引用页面时使用 [[page-id]] 格式。所有写入操作必须在 wiki/ 目录内。`;

/**
 * Agent runner that manages sessions and executes prompts using Pi agent-core.
 */
export class AgentRunner {
  private storage: SessionStorage;
  private engine: WikiEngine;
  private vaultRoot: string;
  private models: Models;
  private activeAgent: Agent | null = null;
  private skills: AgentSkill[];

  constructor(engine: WikiEngine, vaultRoot: string, models: Models) {
    this.engine = engine;
    this.vaultRoot = vaultRoot;
    this.models = models;
    this.storage = new SessionStorage(vaultRoot);
    this.skills = loadBundledSkills();
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
      linkedPageIds: [],
      attachments: [],
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

  async attachSession(sessionId: string, options: { id: string; kind?: "page" | "source"; label?: string; path?: string }): Promise<AgentSession | null> {
    const session = await this.storage.load(sessionId);
    if (!session) return null;
    const attachments = session.attachments ?? [];
    if (!attachments.some((item) => item.id === options.id)) {
      const attachment: AgentAttachment = {
        id: options.id,
        kind: options.kind ?? "page",
        label: options.label ?? options.id,
        path: options.path,
        attachedAt: new Date().toISOString(),
      };
      session.attachments = [...attachments, attachment];
      if (attachment.kind === "page" && !session.linkedPageIds.includes(attachment.id)) {
        session.linkedPageIds.push(attachment.id);
      }
      session.updatedAt = new Date().toISOString();
      await this.storage.save(session);
    }
    return session;
  }

  async detachSession(sessionId: string, attachmentId: string): Promise<AgentSession | null> {
    const session = await this.storage.load(sessionId);
    if (!session) return null;
    session.attachments = (session.attachments ?? []).filter((item) => item.id !== attachmentId);
    session.updatedAt = new Date().toISOString();
    await this.storage.save(session);
    return session;
  }

  /**
   * Archive or unarchive a session.
   */
  async archiveSession(sessionId: string, archived: boolean): Promise<AgentSession | null> {
    return this.storage.archive(sessionId, archived);
  }

  /**
   * Delete a session.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.storage.delete(sessionId);
  }

  /**
   * Stop the in-flight prompt, if any.
   */
  abort(): boolean {
    if (!this.activeAgent) return false;
    this.activeAgent.abort();
    return true;
  }

  /**
   * Execute a prompt within a session.
   */
  async prompt(
    sessionId: string,
    message: string,
    contextOptions?: ContextBuildOptions,
    onEvent?: (event: AgentStreamEvent) => void,
  ): Promise<AgentPromptResult> {
    const session = await this.storage.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const attachedPageIds = (session.attachments ?? [])
      .filter((attachment) => attachment.kind === "page")
      .map((attachment) => attachment.id);
    const graphDepth = Number.isFinite(contextOptions?.graphDepth)
      ? Math.max(0, Math.min(3, Math.floor(contextOptions!.graphDepth!)))
      : 0;
    let neighborLine = "";
    const graphPageId = attachedPageIds[0];
    if (graphPageId && graphDepth > 0) {
      try {
        const graph = await this.engine.getGraph(this.vaultRoot);
        const neighborIds = collectNeighborIds(graph, graphPageId, graphDepth);
        if (neighborIds.length > 0) {
          neighborLine = `\n图谱 ${graphDepth} 跳邻居（仅 ID，无正文）：${neighborIds
            .map((id) => `[[${id}]]`)
            .join(" ")}`;
        }
      } catch {
        /* graph may be empty or not compiled yet */
      }
    }
    const skillBlock = formatSkillsForPrompt(
      this.skills,
      selectSkillsForMessage(message, this.skills),
    );
    const attachedFiles = (session.attachments ?? []).map((attachment) =>
      `${attachment.kind === "page" ? "页面" : "文件"}：${attachment.label}，定位：${attachment.id}${attachment.path ? `，路径：${attachment.path}` : ""}`,
    );
    const pageContext = attachedFiles.length > 0
      ? `用户已明确提供以下资料作为本轮上下文：\n${attachedFiles.join("\n")}\n这些资料不是待用户补充的信息。请先使用对应工具读取资料正文，再回答或执行任务；不要反问用户资料位置。${neighborLine}`
      : "";
    const fullSystemPrompt = [SYSTEM_PROMPT, skillBlock, pageContext].filter(Boolean).join("\n\n");

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
        messages: this.convertToAgentMessages(session.messages, model),
      },
      streamFn: (streamModel, context, options) =>
        this.models.streamSimple(streamModel, context, options),
    });

    // Track tools used and sources
    const toolsUsed = new Set<string>();
    const sources = new Set<string>();

    agent.subscribe((event) => {
      if (event.type === "message_update" && event.message?.role === "assistant") {
        const text = assistantTextFromMessage(event.message);
        if (text) emitStream(onEvent, { type: "text", text });
      }
      if (event.type === "tool_execution_start") {
        emitStream(onEvent, {
          type: "tool_start",
          name: event.toolName,
          id: event.toolCallId,
        });
      }
      if (event.type === "tool_execution_end") {
        toolsUsed.add(event.toolName);
        emitStream(onEvent, {
          type: "tool_end",
          name: event.toolName,
          id: event.toolCallId,
          isError: Boolean(event.isError),
        });
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

    this.activeAgent = agent;
    let aborted = false;
    try {
      await agent.prompt(message);
    } catch (err) {
      aborted = Boolean(agent.signal?.aborted) || /abort/i.test(String(err));
      if (!aborted) {
        throw new Error(`Agent execution failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (this.activeAgent === agent) this.activeAgent = null;
    }

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((msg) => msg.role === "assistant");
    aborted =
      aborted ||
      (lastAssistant?.role === "assistant" && lastAssistant.stopReason === "aborted");
    if (
      !aborted &&
      lastAssistant?.role === "assistant" &&
      lastAssistant.stopReason === "error"
    ) {
      throw new Error(
        lastAssistant.errorMessage || agent.state.errorMessage || "Agent execution failed",
      );
    }
    if (!aborted && agent.state.errorMessage) {
      throw new Error(`Agent execution failed: ${agent.state.errorMessage}`);
    }

    // Extract assistant response and collect all messages from this turn
    const newMessages = agent.state.messages.slice(
      this.convertToAgentMessages(session.messages, model).length,
    );
    
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
          usage: usageFromAssistant(msg),
        });
        const usage = usageFromAssistant(msg);
        if (usage) emitStream(onEvent, { type: "usage", ...usage });
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

    if (!answer) {
      answer = aborted ? "（已停止）" : "（Agent 未返回文本响应）";
      const lastTurnAssistant = [...turnMessages].reverse().find((msg) => msg.role === "assistant");
      if (lastTurnAssistant?.role === "assistant" && !lastTurnAssistant.content.trim()) {
        lastTurnAssistant.content = answer;
      } else if (aborted) {
        turnMessages.push({
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
          provider: session.model.provider,
          model: session.model.modelId,
        });
      }
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
    attachedPageIds.forEach((id) => allLinkedPages.add(id));
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
  private convertToAgentMessages(
    messages: SessionMessage[],
    model: { api: string; provider: string; id: string },
  ): any[] {
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
          api: model.api,
          provider: msg.provider || model.provider,
          model: msg.model || model.id,
          timestamp: msg.timestamp,
          stopReason: msg.toolCalls && msg.toolCalls.length > 0 ? "toolUse" : "stop",
          // Pi streamSimple estimates context from assistant.usage.totalTokens.
          // Older session JSON omitted usage; missing it crashes real (non-mock) calls.
          usage: msg.usage
            ? {
                ...EMPTY_USAGE,
                input: msg.usage.input,
                output: msg.usage.output,
                totalTokens: msg.usage.totalTokens,
              }
            : EMPTY_USAGE,
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

function emitStream(onEvent: ((event: AgentStreamEvent) => void) | undefined, event: AgentStreamEvent): void {
  try {
    onEvent?.(event);
  } catch {
    /* UI/transport emit must not break the agent loop */
  }
}

function usageFromAssistant(message: { usage?: { input?: number; output?: number; totalTokens?: number } }): {
  input: number;
  output: number;
  totalTokens: number;
} | undefined {
  const usage = message.usage;
  if (!usage) return undefined;
  const input = Number(usage.input) || 0;
  const output = Number(usage.output) || 0;
  const totalTokens = Number(usage.totalTokens) || input + output;
  if (!input && !output && !totalTokens) return undefined;
  return { input, output, totalTokens };
}

function assistantTextFromMessage(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        return String((block as { text?: string }).text ?? "");
      }
      return "";
    })
    .join("");
}
