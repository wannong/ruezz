import { AgentRunner, askQuestion } from "@wikihome/agent";
import {
  VaultSettingsSchema,
  type VaultSettings,
  type WikiEngine,
} from "@wikihome/engine-api";
import { createEngine } from "@wikihome/engine-llmwiki";
import { promises as fs } from "node:fs";
import path from "node:path";
import { revealInExplorer } from "./reveal.js";
import { loadPersistedSettings, savePersistedSettings } from "./settings-store.js";

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

  constructor(initial?: Partial<VaultSettings>) {
    this.settings = VaultSettingsSchema.parse({
      ...loadPersistedSettings(),
      ...initial,
    });
    this.engine = createEngine(this.settings);
  }

  private async getAgentRunner(): Promise<AgentRunner> {
    if (!this.agentRunner && this.settings.vaultPath) {
      // Create Models collection with faux provider for mock mode or real provider
      const { createModels } = await import("@earendil-works/pi-ai");
      const models = createModels();
      
      if (this.settings.mock) {
        // Use faux provider for testing
        const { fauxProvider } = await import("@earendil-works/pi-ai");
        const handle = fauxProvider();
        models.setProvider(handle.provider);
      } else {
        // Use OpenAI provider (requires standard OpenAI setup)
        const { openaiProvider } = await import("@earendil-works/pi-ai/providers/openai");
        models.setProvider(openaiProvider());
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
    this.settings = VaultSettingsSchema.parse({ ...this.settings, ...patch });
    this.engine.close?.();
    this.engine = createEngine(this.settings);
    try {
      savePersistedSettings(this.settings);
    } catch {
      /* config dir may be read-only in some test environments */
    }
    return this.getSettings();
  }

  private requireVault(): string {
    if (!this.settings.vaultPath) throw new Error("尚未设置知识库路径");
    return this.settings.vaultPath;
  }

  async handle(req: RpcRequest): Promise<RpcResponse> {
    try {
      const result = await this.dispatch(req.method, req.params ?? {});
      return { id: req.id, result };
    } catch (err) {
      return {
        id: req.id,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
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
        const session = await runner.createSession({
          title: params.title ? String(params.title) : undefined,
          currentPageId: params.currentPageId ? String(params.currentPageId) : undefined,
          model: params.model
            ? {
                provider: String((params.model as any).provider),
                modelId: String((params.model as any).modelId),
              }
            : undefined,
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
        const graphDepth = params.graphDepth ? Number(params.graphDepth) : 1;

        const result = await runner.prompt(sessionId, message, {
          currentPageId,
          graphDepth,
        });

        return {
          answer: result.answer,
          sources: result.sources,
          linkedPageIds: result.linkedPageIds,
          toolsUsed: result.toolsUsed,
          session: result.session,
        };
      }
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
        // Return available providers (hardcoded for now, based on settings)
        return {
          providers: [
            {
              name: "openai",
              models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
            },
            {
              name: "anthropic",
              models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
            },
            {
              name: "openai-compatible",
              models: ["custom-model"],
            },
          ],
        };
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
