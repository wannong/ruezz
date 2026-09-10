import { api, type VaultSettings } from "../api";

type SettingsFieldsProps = {
  settings: VaultSettings;
  onChange: (next: VaultSettings) => void;
};

export function SettingsFields({ settings, onChange }: SettingsFieldsProps) {
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
      <label className="label">
        API Base URL
        <input
          value={settings.apiBaseUrl}
          onChange={(e) => onChange({ ...settings, apiBaseUrl: e.target.value })}
        />
      </label>
      <label className="label">
        API Key
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) =>
            onChange({ ...settings, apiKey: e.target.value, mock: !e.target.value })
          }
          placeholder="留空则使用本地 mock"
        />
      </label>
      <label className="label">
        模型名
        <input
          value={settings.model}
          onChange={(e) => onChange({ ...settings, model: e.target.value })}
        />
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.mock}
          onChange={(e) => onChange({ ...settings, mock: e.target.checked })}
        />
        使用 Mock LLM
      </label>
    </div>
  );
}
