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
import { listOpenAiModels, testOpenAiConnection } from "./openai-compat.js";
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
    this.settings = ensureLlmProviders(
      VaultSettingsSchema.parse({
        ...(hasPersisted ? persistedRest : env),
        ...initial,
      }),
    );
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
        // Most OpenAI-compatible servers (LM Studio, 代理、国产网关) speak
        // /v1/chat/completions, not the newer /v1/responses API.
        const { openAICompletionsApi } = await import(
          "@earendil-works/pi-ai/api/openai-completions.lazy"
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
        const provider = createProvider({
          id: "openai-compatible",
          name: "OpenAI Compatible",
          baseUrl: this.settings.apiBaseUrl,
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
          models: modelIds.map((id) => ({
            id,
            name: id,
            provider: "openai-compatible",
            api: "openai-completions" as const,
            baseUrl: this.settings.apiBaseUrl,
            reasoning: false,
            input: ["text" as const],
            contextWindow: 128000,
            maxTokens: 16384,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          })),
          api: openAICompletionsApi(),
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
    } catch {
      /* config dir may be read-only in some test environments */
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
  ): Promise<RpcResponse> {
    try {
      const result = await this.dispatch(req.method, req.params ?? {}, emit);
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
  ): Promise<unknown> {
    switch (method) {
      case "settings_get":
        return this.getSettings();
      case "settings_set":
        return this.setSettings(params as Partial<VaultSettings>);
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
          return this.engine.ingestText(root, String(params.title ?? "untitled"), String(params.text));
        }
        return this.engine.ingestFile(root, String(params.path));
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
      case "agent_session_delete": {
        const runner = await this.getAgentRunner();
        const deleted = await runner.deleteSession(String(params.id ?? params.sessionId ?? ""));
        return { ok: deleted };
      }
      case "agent_prompt": {
        const runner = await this.getAgentRunner();
        const sessionId = String(params.sessionId ?? "");
        const message = String(params.message ?? params.question ?? "");
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
