import { askQuestion } from "@wikihome/agent";
import {
  VaultSettingsSchema,
  type VaultSettings,
  type WikiEngine,
} from "@wikihome/engine-api";
import { createEngine } from "@wikihome/engine-llmwiki";

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

  constructor(initial?: Partial<VaultSettings>) {
    this.settings = VaultSettingsSchema.parse({
      vaultPath: initial?.vaultPath ?? "",
      apiBaseUrl: initial?.apiBaseUrl ?? "https://api.openai.com/v1",
      apiKey: initial?.apiKey ?? "",
      model: initial?.model ?? "gpt-4o-mini",
      mock: initial?.mock ?? false,
    });
    this.engine = createEngine(this.settings);
  }

  getSettings(): VaultSettings {
    return { ...this.settings };
  }

  setSettings(patch: Partial<VaultSettings>): VaultSettings {
    this.settings = VaultSettingsSchema.parse({ ...this.settings, ...patch });
    this.engine.close?.();
    this.engine = createEngine(this.settings);
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
      case "vault_lint":
        return this.engine.lint(this.requireVault());
      case "vault_read_index":
        return { markdown: await this.engine.readIndex(this.requireVault()) };
      case "ping":
        return { ok: true, version: "0.1.0" };
      default:
        throw new Error(`unknown method: ${method}`);
    }
  }

  close(): void {
    this.engine.close?.();
  }
}
