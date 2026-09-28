import { Palette } from "lucide-react";
import { vaultName } from "../lib/fileTree";
import { PALETTE_META, type ColorPalette } from "../theme";

type StatusBarProps = {
  vaultPath: string;
  pageCount: number;
  currentId: string | null;
  busy: boolean;
  notice?: string | null;
  dirty: boolean;
  saving: boolean;
  palette: ColorPalette;
  onCyclePalette: () => void;
};

export function StatusBar({
  vaultPath,
  pageCount,
  currentId,
  busy,
  notice,
  dirty,
  saving,
  palette,
  onCyclePalette,
}: StatusBarProps) {
  const paletteLabel = PALETTE_META[palette].label;

  return (
    <footer className="status-bar">
      <span className="status-item" title={vaultPath ? `${vaultPath} / wiki` : ""}>
        {vaultName(vaultPath)}
      </span>
      <span className="status-item">{pageCount} 页</span>
      {currentId && <span className="status-item">{currentId}</span>}
      {saving && <span className="status-item"><span className="status-dot" />保存中…</span>}
      {dirty && !saving && <span className="status-item">未保存</span>}
      {busy && <span className="status-item"><span className="status-dot" />工作中…</span>}
      {notice && <span className="status-item">{notice}</span>}
      <span className="status-spacer" />
      <button
        type="button"
        className="icon-btn status-theme"
        data-icon="palette"
        onClick={onCyclePalette}
        title={`界面配色：${paletteLabel}（点击切换）`}
      >
        <Palette size={14} />
        <span className="status-palette-label">{paletteLabel}</span>
      </button>
    </footer>
  );
}
