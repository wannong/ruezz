import { AgentRunner, askQuestion, type AgentStreamEvent } from "@wikihome/agent";
import {
  VaultSettingsSchema,
  ensureLlmProviders,
  type VaultSettings,
  type WikiEngine,
} from "@wikihome/engine-api";
import { createEngine } from "@wikihome/engine-llmwiki";
import { promises as fs } from "node:fs";
import path from "node:path";
import { revealInExplorer } from "./reveal.js";
import { anthropicMessagesBaseUrl, listOpenAiModels, looksLikeClaudeModel, testOpenAiConnection } from "./openai-compat.js";
import { loadPersistedSettings, savePersistedSettings, settingsFromEnv } from "./settings-store.js";

export type RpcRequest = {
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type RpcResponse = {
  id: string | number;
  result?: unknown;
  error?: { message: string };
};

export type RpcContext = {
  allowExternalImport?: boolean;
  exposeSecrets?: boolean;
};

const MAX_AGENT_MESSAGE_CHARS = 32_000;
const MAX_INGEST_TEXT_CHARS = 2_000_000;

export class SidecarSession {
  private settings: VaultSettings;
  private engine: WikiEngine;
  private agentRunner: AgentRunner | null = null;
  private listedModelIds: string[] = [];

  constructor(initial?: Partial<VaultSettings>) {
    const persisted = loadPersistedSettings();
    const env = settingsFromEnv();
    const hasPersisted = Object.keys(persisted).length > 0;
    // Faux LLM is smoke-only (`initial.mock` or WIKIHOME_MOCK=1 with no saved settings).
    // Never restore mock from disk — it used to leave the desktop stuck on canned replies.
    const { mock: _persistedMock, ...persistedRest } = persisted;
    try {
      this.settings = ensureLlmProviders(
        VaultSettingsSchema.parse({
          ...(hasPersisted ? persistedRest : env),
          ...initial,
        }),
      );
    } catch (err) {
      process.stderr.write(
        `settings parse failed, using defaults: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      this.settings = ensureLlmProviders(VaultSettingsSchema.parse({ ...env, ...initial }));
    }
    this.engine = createEngine(this.settings);
  }

  private async getAgentRunner(): Promise<AgentRunner> {
    if (!this.agentRunner && this.settings.vaultPath) {
      // Create Models collection
      const { createModels, createProvider } = await import("@earendil-works/pi-ai");
      const models = createModels();
      
      if (this.settings.mock) {
        // Scripted faux model: each turn calls a wiki lookup tool then answers.
        const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(
          "@earendil-works/pi-ai"
        );
        const handle = fauxProvider({ tokensPerSecond: 0 });
        models.setProvider(handle.provider);
        handle.setResponses(Array.from({ length: 32 }, () => mockWikiFauxStep));

        function mockWikiFauxStep(context: {
          messages: Array<{ role: string; content?: unknown }>;
        }) {
          const last = context.messages[context.messages.length - 1];
          if (last?.role === "toolResult") {
            return fauxAssistantMessage("已根据知识库工具结果作答。", { stopReason: "stop" });
          }
          const userText = latestUserText(context.messages);
          if (/读|read/i.test(userText)) {
            const linked = JSON.stringify(context.messages).match(/\[\[([^\]]+)\]\]/);
            return fauxAssistantMessage(
              [fauxToolCall("read_page", { id: linked?.[1] ?? "attention" })],
              { stopReason: "toolUse" },
            );
          }
          if (/search|搜索/i.test(userText)) {
            return fauxAssistantMessage(
              [fauxToolCall("search_pages", { query: userText.slice(0, 80) || "attention" })],
              { stopReason: "toolUse" },
            );
          }
          return fauxAssistantMessage([fauxToolCall("list_pages", {})], {
            stopReason: "toolUse",
          });
        }
      } else {
        // Most gateways speak /v1/chat/completions. Claude on some proxies
        // (e.g. foxnio) returns Cloudflare 502 when that path includes tools;
        // those models must use Anthropic /v1/messages instead.
        const { openAICompletionsApi } = await import(
          "@earendil-works/pi-ai/api/openai-completions.lazy"
        );
        const { anthropicMessagesApi } = await import(
          "@earendil-works/pi-ai/api/anthropic-messages.lazy"
        );
        const active = this.settings.providers.find((p) => p.id === this.settings.activeProviderId);
        const modelIds = [
          ...new Set(
            [this.settings.model, ...(active?.models ?? []), ...this.listedModelIds].filter(Boolean),
          ),
        ];
        if (modelIds.length === 0) {
          throw new Error("当前没有可用模型。请在设置中填写 API 并拉取模型。");
        }
        const openAiBase = this.settings.apiBaseUrl;
        const anthropicBase = anthropicMessagesBaseUrl(openAiBase);
        const provider = createProvider({
          id: "openai-compatible",
          name: "OpenAI Compatible",
          baseUrl: openAiBase,
          auth: {
            apiKey: {
              name: "API Key",
              resolve: async () => {
                const key = this.settings.apiKey.trim();
                return {
                  source: "settings",
                  auth: key ? { apiKey: key } : {},
                };
              },
            },
          },
          models: modelIds.map((id) => {
            const claude = looksLikeClaudeModel(id);
            return {
              id,
              name: id,
              provider: "openai-compatible" as const,
              api: (claude ? "anthropic-messages" : "openai-completions") as
                | "anthropic-messages"
                | "openai-completions",
              baseUrl: claude ? anthropicBase : openAiBase,
              reasoning: false,
              input: ["text" as const],
              contextWindow: 128000,
              maxTokens: 16384,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            };
          }),
          api: {
            "anthropic-messages": anthropicMessagesApi(),
            "openai-completions": openAICompletionsApi(),
          },
        });

        models.setProvider(provider);
      }
      
      this.agentRunner = new AgentRunner(this.engine, this.settings.vaultPath, models);
      await this.agentRunner.init();
    }
    if (!this.agentRunner) {
      throw new Error("Agent runner not initialized: vault path not set");
    }
    return this.agentRunner;
  }

  getSettings(): VaultSettings {
    return { ...this.settings };
  }

  private publicSettings(): VaultSettings {
    return {
      ...this.settings,
      apiKey: "",
      providers: this.settings.providers.map((provider) => ({ ...provider, apiKey: "" })),
    };
  }

  private settingsPatchWithoutSecrets(patch: Partial<VaultSettings>): Partial<VaultSettings> {
    if (patch.apiKey) throw new Error("HTTP 模式不能设置 API Key，请使用桌面应用或环境变量");
    const providers = patch.providers?.map((provider) => {
      if (provider.apiKey) throw new Error("HTTP 模式不能设置 API Key，请使用桌面应用或环境变量");
      const current = this.settings.providers.find((item) => item.id === provider.id);
      return { ...provider, apiKey: current?.apiKey ?? "" };
    });
    return { ...patch, apiKey: this.settings.apiKey, ...(providers ? { providers } : {}) };
  }

  setSettings(patch: Partial<VaultSettings>): VaultSettings {
    const oldSettings = { ...this.settings };
    this.settings = ensureLlmProviders(
      VaultSettingsSchema.parse({ ...this.settings, ...patch }),
    );
    
    // Clean up old engine and agent runner
    this.engine.close?.();
    this.engine = createEngine(this.settings);
    
    // Force rebuild agent runner if critical settings changed
    const needsRebuild =
      oldSettings.vaultPath !== this.settings.vaultPath ||
      oldSettings.mock !== this.settings.mock ||
      oldSettings.apiBaseUrl !== this.settings.apiBaseUrl ||
      oldSettings.apiKey !== this.settings.apiKey ||
      oldSettings.model !== this.settings.model ||
      oldSettings.activeProviderId !== this.settings.activeProviderId ||
      JSON.stringify(oldSettings.providers) !== JSON.stringify(this.settings.providers);

    if (oldSettings.apiBaseUrl !== this.settings.apiBaseUrl) {
      this.listedModelIds = [];
    }
    
    if (needsRebuild && this.agentRunner) {
      this.agentRunner = null;
    }
    
    try {
      savePersistedSettings(this.settings);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`保存设置失败：${message}\n`);
    }
    return this.getSettings();
  }

  abortPrompt(): boolean {
    return this.agentRunner?.abort() ?? false;
  }

  requireVault(): string {
    if (!this.settings.vaultPath) throw new Error("尚未设置知识库路径");
    return this.settings.vaultPath;
  }

  async handle(
    req: RpcRequest,
    emit?: (event: AgentStreamEvent) => void,
    context: RpcContext = {},
  ): Promise<RpcResponse> {
    try {
      if (!req || (typeof req.id !== "string" && typeof req.id !== "number")) {
        throw new Error("invalid request id");
      }
      if (typeof req.method !== "string" || !req.method) throw new Error("invalid request method");
      if (req.params != null && (typeof req.params !== "object" || Array.isArray(req.params))) {
        throw new Error("invalid request params");
      }
      const result = await this.dispatch(req.method, req.params ?? {}, emit, context);
      return { id: req.id, result };
    } catch (err) {
      return {
        id: req.id,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>,
    emit?: (event: AgentStreamEvent) => void,
    context: RpcContext = {},
  ): Promise<unknown> {
    switch (method) {
      case "settings_get":
        return context.exposeSecrets ? this.getSettings() : this.publicSettings();
      case "settings_set": {
        const updated = this.setSettings(
          context.exposeSecrets
            ? (params as Partial<VaultSettings>)
            : this.settingsPatchWithoutSecrets(params as Partial<VaultSettings>),
        );
        return context.exposeSecrets ? updated : this.publicSettings();
      }
      case "vault_init": {
        const root = String(params.root ?? this.settings.vaultPath);
        if (!root) throw new Error("root 必填");
        this.setSettings({ vaultPath: root });
        await this.engine.initVault(root);
        return { root };
      }
      case "vault_ingest": {
        const root = this.requireVault();
        if (params.text != null) {
          const text = String(params.text);
          if (text.length > MAX_INGEST_TEXT_CHARS) throw new Error("入库文本过大");
          return this.engine.ingestText(root, String(params.title ?? "untitled"), text);
        }
        return this.engine.ingestFile(root, String(params.path), {
          allowExternalSource: context.allowExternalImport && params.approvedExternal === true,
        });
      }
      case "vault_ask": {
        const root = this.requireVault();
        return askQuestion(this.engine, root, String(params.question ?? ""));
      }
      case "vault_list_pages":
        return this.engine.listPages(this.requireVault());
      case "vault_read_page":
        return this.engine.readPage(this.requireVault(), String(params.id ?? params.path ?? ""));
      case "vault_write_page":
        return this.engine.writePage(
          this.requireVault(),
          String(params.id ?? params.path ?? ""),
          String(params.raw ?? ""),
        );
      case "vault_update_page_tags": {
        const rawTags = params.tags;
        if (!Array.isArray(rawTags)) throw new Error("tags 必须是数组");
        return this.engine.updatePageTags(
          this.requireVault(),
          String(params.id ?? params.path ?? ""),
          rawTags.map(String),
        );
      }
      case "vault_read_source":
        return this.engine.readSource(
          this.requireVault(),
          String(params.id ?? params.pageId ?? ""),
        );
      case "vault_create_page":
        return this.engine.createPage(
          this.requireVault(),
          String(params.id ?? params.path ?? ""),
          params.title == null ? undefined : String(params.title),
        );
      case "vault_copy_page":
        return this.engine.copyPage(
          this.requireVault(),
          String(params.from ?? params.id ?? ""),
          String(params.to ?? ""),
        );
      case "vault_rename_page":
        return this.engine.renamePage(
          this.requireVault(),
          String(params.from ?? params.id ?? ""),
          String(params.to ?? ""),
        );
      case "vault_list_folders":
        return this.engine.listFolders(this.requireVault());
      case "vault_create_folder":
        return this.engine.createFolder(this.requireVault(), String(params.id ?? params.path ?? ""));
      case "vault_copy_folder":
        return this.engine.copyFolder(
          this.requireVault(),
          String(params.from ?? params.id ?? ""),
          String(params.to ?? ""),
        );
      case "vault_rename_folder":
        return this.engine.renameFolder(
          this.requireVault(),
          String(params.from ?? params.id ?? ""),
          String(params.to ?? ""),
        );
      case "vault_reveal": {
        const root = this.requireVault();
        const kind = String(params.kind ?? "root");
        const id = String(params.id ?? params.path ?? "");
        let target = path.join(path.resolve(root), "wiki");
        if (kind === "page" && id) {
          const page = await this.engine.readPage(root, id);
          if (!page) throw new Error(`页面不存在：${id}`);
          target = path.resolve(root, page.path);
        } else if (kind === "folder" && id) {
          target = path.join(path.resolve(root), "wiki", ...id.split("/").filter(Boolean));
        }
        if (kind !== "page") await fs.mkdir(target, { recursive: true });
        if (params.open !== false) await revealInExplorer(target);
        return { path: target };
      }
      case "vault_lint":
        return this.engine.lint(this.requireVault());
      case "vault_read_index":
        return { markdown: await this.engine.readIndex(this.requireVault()) };
      case "vault_search":
        return this.engine.findPages(this.requireVault(), String(params.query ?? ""));
      case "vault_graph":
        return this.engine.getGraph(this.requireVault());
      case "vault_backlinks":
        return this.engine.backlinks(
          this.requireVault(),
          String(params.id ?? params.pageId ?? ""),
        );
      case "agent_session_list": {
        const runner = await this.getAgentRunner();
        const sessions = await runner.listSessions();
        return { sessions };
      }
      case "agent_session_create": {
        const runner = await this.getAgentRunner();
        const requested = params.model
          ? {
              provider: String((params.model as { provider?: string }).provider ?? ""),
              modelId: String(
                (params.model as { modelId?: string; model?: string }).modelId ??
                  (params.model as { model?: string }).model ??
                  "",
              ),
            }
          : !this.settings.mock && this.settings.model
            ? { provider: "openai-compatible", modelId: this.settings.model }
            : undefined;
        const session = await runner.createSession({
          title: params.title ? String(params.title) : undefined,
          currentPageId: params.currentPageId ? String(params.currentPageId) : undefined,
          model: requested,
        });
        return { session };
      }
      case "agent_session_get": {
        const runner = await this.getAgentRunner();
        const session = await runner.getSession(String(params.id ?? params.sessionId ?? ""));
        if (!session) throw new Error(`Session not found: ${params.id ?? params.sessionId}`);
        return { session };
      }
      case "agent_session_attach": {
        const runner = await this.getAgentRunner();
        const session = await runner.attachSession(String(params.sessionId ?? params.id ?? ""), {
          id: String(params.attachmentId ?? params.pageId ?? params.path ?? ""),
          kind: params.kind === "source" ? "source" : "page",
          label: params.label == null ? undefined : String(params.label),
          path: params.path == null ? undefined : String(params.path),
        });
        if (!session) throw new Error(`Session not found: ${params.sessionId ?? params.id}`);
        return { session };
      }
      case "agent_session_detach": {
        const runner = await this.getAgentRunner();
        const session = await runner.detachSession(
          String(params.sessionId ?? params.id ?? ""),
          String(params.attachmentId ?? params.pageId ?? ""),
        );
        if (!session) throw new Error(`Session not found: ${params.sessionId ?? params.id}`);
        return { session };
      }
      case "agent_session_delete": {
        const runner = await this.getAgentRunner();
        const deleted = await runner.deleteSession(String(params.id ?? params.sessionId ?? ""));
        return { ok: deleted };
      }
      case "agent_session_archive": {
        const runner = await this.getAgentRunner();
        const archived = params.archived == null ? true : Boolean(params.archived);
        const session = await runner.archiveSession(String(params.id ?? params.sessionId ?? ""), archived);
        if (!session) throw new Error(`Session not found: ${params.id ?? params.sessionId}`);
        return { session };
      }
      case "agent_prompt": {
        const runner = await this.getAgentRunner();
        const sessionId = String(params.sessionId ?? "");
        const message = String(params.message ?? params.question ?? "");
        if (!message.trim()) throw new Error("消息不能为空");
        if (message.length > MAX_AGENT_MESSAGE_CHARS) throw new Error("消息过长");
        const currentPageId = params.currentPageId ? String(params.currentPageId) : undefined;
        const graphDepthRaw = Number(params.graphDepth ?? 0);
        const graphDepth = Number.isFinite(graphDepthRaw) ? graphDepthRaw : 0;

        const result = await runner.prompt(
          sessionId,
          message,
          {
            currentPageId,
            graphDepth,
          },
          emit,
        );

        return {
          answer: result.answer,
          sources: result.sources,
          linkedPageIds: result.linkedPageIds,
          toolsUsed: result.toolsUsed,
          session: result.session,
        };
      }
      case "agent_abort":
        return { ok: this.abortPrompt() };
      case "agent_set_model": {
        const runner = await this.getAgentRunner();
        const sessionId = String(params.sessionId ?? "");
        const provider = String(params.provider ?? "");
        const modelId = String(params.model ?? params.modelId ?? "");
        const session = await runner.setModel(sessionId, provider, modelId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);
        return { session };
      }
      case "agent_list_providers": {
        const runner = await this.getAgentRunner();
        const models = runner.getModels();
        
        // Group models by provider
        const providerMap = new Map<string, Set<string>>();
        for (const model of models) {
          if (!providerMap.has(model.provider)) {
            providerMap.set(model.provider, new Set());
          }
          providerMap.get(model.provider)!.add(model.id);
        }
        
        const providers = Array.from(providerMap.entries()).map(([name, modelIds]) => ({
          name,
          models: Array.from(modelIds),
        }));
        
        return { providers };
      }
      case "provider_list_models": {
        const apiBaseUrl = String(params.apiBaseUrl ?? this.settings.apiBaseUrl ?? "");
        const apiKey = String(params.apiKey ?? this.settings.apiKey ?? "");
        const models = await listOpenAiModels(apiBaseUrl, apiKey);
        this.listedModelIds = models;
        this.agentRunner = null;
        return { models };
      }
      case "provider_test": {
        const apiBaseUrl = String(params.apiBaseUrl ?? this.settings.apiBaseUrl ?? "");
        const apiKey = String(params.apiKey ?? this.settings.apiKey ?? "");
        const model = String(params.model ?? this.settings.model ?? "");
        return testOpenAiConnection(apiBaseUrl, apiKey, model);
      }
      case "ping":
        return { ok: true, version: "0.1.0" };
      default:
        throw new Error(`unknown method: ${method}`);
    }
  }

  close(): void {
    this.engine.close?.();
    this.agentRunner = null;
  }
}

function latestUserText(messages: Array<{ role: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .map((block) => {
        if (block && typeof block === "object" && "type" in block && (block as { type: string }).type === "text") {
          return String((block as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}
