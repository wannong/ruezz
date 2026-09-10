import { useState } from "react";
import { api, type LlmProvider, type VaultSettings } from "../api";
import {
  activeProviderIdOf,
  isPresetProviderId,
  newProviderId,
  providersOf,
  syncSettings,
  uniqueModelIds,
} from "../lib/llmProviders";

type SettingsFieldsProps = {
  settings: VaultSettings;
  onChange: (next: VaultSettings) => void;
};

function hostLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "未填地址";
  try {
    return new URL(trimmed).host || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0] || trimmed;
  }
}

export function SettingsFields({ settings, onChange }: SettingsFieldsProps) {
  const providers = providersOf(settings);
  const activeId = activeProviderIdOf(settings, providers);
  const [providerBusy, setProviderBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [draftModel, setDraftModel] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  function commit(nextProviders: LlmProvider[], nextActiveId = activeId, model = settings.model) {
    onChange(syncSettings(settings, nextProviders, nextActiveId, model));
  }

  function patchProvider(id: string, patch: Partial<LlmProvider>) {
    commit(providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)));
  }

  function addProvider() {
    const id = newProviderId();
    setOpenId(id);
    commit(
      [
        ...providers,
        {
          id,
          name: `服务商 ${providers.length + 1}`,
          apiBaseUrl: "",
          apiKey: "",
          models: [],
        },
      ],
      id,
      "",
    );
  }

  function removeProvider(id: string) {
    if (isPresetProviderId(id)) return;
    const next = providers.filter((provider) => provider.id !== id);
    if (openId === id) setOpenId(null);
    const nextActive = id === activeId ? next[0].id : activeId;
    const active = next.find((provider) => provider.id === nextActive) ?? next[0];
    commit(next, nextActive, active?.models[0] ?? "");
  }

  async function listModels(provider: LlmProvider) {
    setProviderBusy(`${provider.id}:list`);
    setStatus(null);
    try {
      const { models } = await api.providerListModels({
        apiBaseUrl: provider.apiBaseUrl,
        apiKey: provider.apiKey,
      });
      const merged = uniqueModelIds([...models, ...provider.models]);
      const nextProviders = providers.map((row) =>
        row.id === provider.id ? { ...row, models: merged } : row,
      );
      const nextModel = settings.model.trim() && merged.includes(settings.model) ? settings.model : merged[0] || "";
      onChange({
        ...syncSettings(settings, nextProviders, provider.id, nextModel),
        mock: false,
      });
      setStatus({ kind: "ok", text: `已拉取 ${models.length} 个模型。点选后保存设置。` });
      setOpenId(provider.id);
    } catch (e) {
      setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setProviderBusy(null);
    }
  }

  async function testConnection(provider: LlmProvider) {
    const model = provider.id === activeId ? settings.model : provider.models[0] || "";
    setProviderBusy(`${provider.id}:test`);
    setStatus(null);
    try {
      const { reply } = await api.providerTest({
        apiBaseUrl: provider.apiBaseUrl,
        apiKey: provider.apiKey,
        model,
      });
      onChange({ ...syncSettings(settings, providers, provider.id, model), mock: false });
      const preview = reply.replace(/\s+/g, " ").slice(0, 80);
      setStatus({ kind: "ok", text: `连接成功：${preview}。请保存设置。` });
    } catch (e) {
      setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setProviderBusy(null);
    }
  }

  function addManualModel(provider: LlmProvider) {
    const id = (draftModel[provider.id] ?? "").trim();
    if (!id) return;
    const models = uniqueModelIds([...provider.models, id]);
    const nextProviders = providers.map((row) => (row.id === provider.id ? { ...row, models } : row));
    onChange(syncSettings(settings, nextProviders, provider.id, id));
    setDraftModel((d) => ({ ...d, [provider.id]: "" }));
  }

  return (
    <div className="grid-form">
      <label className="label">
        知识库文件夹
        <div className="row">
          <input
            value={settings.vaultPath}
            onChange={(e) => onChange({ ...settings, vaultPath: e.target.value })}
            placeholder="例如 D:\MyVault"
          />
          <button
            type="button"
            onClick={async () => {
              const folder = await api.pickFolder();
              if (folder) onChange({ ...settings, vaultPath: folder });
            }}
          >
            浏览…
          </button>
        </div>
      </label>

      <div className="settings-section-head">
        <span>模型服务商</span>
        <button type="button" onClick={addProvider}>
          添加自定义
        </button>
      </div>
      <p className="hint">已预填 OpenAI、DeepSeek、GLM、Kimi 地址。粘贴 API Key 后点拉取模型；点条目可展开改地址或选模型。</p>

      {providers.map((provider) => {
        const busy = providerBusy?.startsWith(`${provider.id}:`) ?? false;
        const isActive = provider.id === activeId;
        const open = provider.id === openId;
        const preset = isPresetProviderId(provider.id);
        const modelLabel = provider.models.length ? `${provider.models.length} 个模型` : "无模型";
        return (
          <section
            key={provider.id}
            className={`provider-card${isActive ? " provider-card-active" : ""}${open ? "" : " provider-card-collapsed"}`}
          >
            <div className="provider-card-head">
              <button
                type="button"
                className={`provider-fold${open ? " provider-fold-open" : ""}`}
                aria-expanded={open}
                aria-label={open ? `收起 ${provider.name}` : `展开 ${provider.name}`}
                onClick={() => setOpenId(open ? null : provider.id)}
              >
                <span className="provider-chevron" aria-hidden>
                  {open ? "▾" : "▸"}
                </span>
                {!open && (
                  <>
                    <span className="provider-fold-title">{provider.name}</span>
                    <span className="provider-summary">
                      {hostLabel(provider.apiBaseUrl)} · {modelLabel}
                    </span>
                  </>
                )}
              </button>
              {open && (
                <input
                  className="provider-name"
                  value={provider.name}
                  onChange={(e) => patchProvider(provider.id, { name: e.target.value || "未命名" })}
                  aria-label="服务商名称"
                />
              )}
              {isActive && <span className="provider-badge">当前</span>}
              {!preset && (
                <button type="button" className="ghost" onClick={() => removeProvider(provider.id)}>
                  删除
                </button>
              )}
            </div>
            {!open && (
              <div className="provider-quick">
                <input
                  type="password"
                  value={provider.apiKey}
                  onChange={(e) => patchProvider(provider.id, { apiKey: e.target.value })}
                  placeholder="粘贴 API Key"
                  aria-label={`${provider.name} API Key`}
                />
                <button type="button" disabled={busy} onClick={() => void listModels(provider)}>
                  {providerBusy === `${provider.id}:list` ? "拉取中…" : "拉取模型"}
                </button>
              </div>
            )}
            {open && (
              <div className="provider-card-body">
                <label className="label">
                  API Base URL
                  <input
                    value={provider.apiBaseUrl}
                    onChange={(e) => patchProvider(provider.id, { apiBaseUrl: e.target.value })}
                    placeholder="http://127.0.0.1:1234/v1"
                  />
                  <span className="hint">需包含 /v1</span>
                </label>
                <label className="label">
                  API Key
                  <input
                    type="password"
                    value={provider.apiKey}
                    onChange={(e) => patchProvider(provider.id, { apiKey: e.target.value })}
                    placeholder="粘贴 API Key，本地服务可留空"
                  />
                </label>
                <div className="settings-provider-actions">
                  <button type="button" disabled={busy} onClick={() => void listModels(provider)}>
                    {providerBusy === `${provider.id}:list` ? "拉取中…" : "拉取模型"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void testConnection(provider)}>
                    {providerBusy === `${provider.id}:test` ? "测试中…" : "测试连接"}
                  </button>
                </div>
                <div className="model-list" role="listbox" aria-label={`${provider.name} 模型`}>
                  {provider.models.length === 0 ? (
                    <div className="model-list-empty">尚未拉取或添加模型</div>
                  ) : (
                    provider.models.map((id) => {
                      const selected = isActive && settings.model === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`model-chip${selected ? " active" : ""}`}
                          onClick={() => commit(providers, provider.id, id)}
                        >
                          {id}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="row">
                  <input
                    value={draftModel[provider.id] ?? ""}
                    onChange={(e) => setDraftModel((d) => ({ ...d, [provider.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addManualModel(provider);
                      }
                    }}
                    placeholder="手动输入模型名后回车"
                  />
                  <button type="button" onClick={() => addManualModel(provider)}>
                    添加
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {status && (
        <div className={status.kind === "err" ? "settings-status settings-status-err" : "settings-status"}>
          {status.text}
        </div>
      )}
    </div>
  );
}
