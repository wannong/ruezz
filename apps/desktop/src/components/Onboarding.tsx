import { SettingsFields } from "./SettingsFields";
import type { VaultSettings } from "../api";
import type { ColorPalette } from "../theme";

type OnboardingProps = {
  settings: VaultSettings;
  onChange: (next: VaultSettings) => void;
  palette: ColorPalette;
  onPaletteChange: (palette: ColorPalette) => void;
  busy: boolean;
  error: string | null;
  onStart: () => void;
};

export function Onboarding({ settings, onChange, palette, onPaletteChange, busy, error, onStart }: OnboardingProps) {
  const canStart = settings.vaultPath.trim().length > 0;

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1 className="brand">Ruezz</h1>
        <p className="brand-sub">瑞知</p>
        <p className="lead">选择知识库文件夹并配置模型后进入工作台。路径会记住，下次自动打开。</p>
        <SettingsFields settings={settings} onChange={onChange} palette={palette} onPaletteChange={onPaletteChange} />
        <button className="primary start-btn" type="button" disabled={!canStart || busy} onClick={onStart}>
          {busy ? "创建中…" : "进入工作台"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
