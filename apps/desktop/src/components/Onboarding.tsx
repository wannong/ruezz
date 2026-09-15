import { SettingsFields } from "./SettingsFields";
import type { VaultSettings } from "../api";

type OnboardingProps = {
  settings: VaultSettings;
  onChange: (next: VaultSettings) => void;
  busy: boolean;
  error: string | null;
  onStart: () => void;
};

export function Onboarding({ settings, onChange, busy, error, onStart }: OnboardingProps) {
  const canStart = settings.vaultPath.trim().length > 0;

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1 className="brand">Centaur</h1>
        <p className="lead">选择知识库文件夹并配置模型后进入工作台。路径会记住，下次自动打开。</p>
        <SettingsFields settings={settings} onChange={onChange} />
        <button className="primary start-btn" type="button" disabled={!canStart || busy} onClick={onStart}>
          {busy ? "创建中…" : "进入工作台"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
