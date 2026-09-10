import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme";
import { vaultName } from "../lib/fileTree";

type StatusBarProps = {
  vaultPath: string;
  pageCount: number;
  currentId: string | null;
  busy: boolean;
  notice?: string | null;
  dirty: boolean;
  saving: boolean;
  theme: Theme;
  onToggleTheme: () => void;
};

export function StatusBar({
  vaultPath,
  pageCount,
  currentId,
  busy,
  notice,
  dirty,
  saving,
  theme,
  onToggleTheme,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-item" title={vaultPath ? `${vaultPath} / wiki` : ""}>
        {vaultName(vaultPath)}
      </span>
      <span className="status-item">{pageCount} 页</span>
      {currentId && <span className="status-item">{currentId}</span>}
      {saving && <span className="status-item">保存中…</span>}
      {dirty && !saving && <span className="status-item">未保存</span>}
      {busy && <span className="status-item">工作中…</span>}
      {notice && <span className="status-item">{notice}</span>}
      <span className="status-spacer" />
      <button type="button" className="icon-btn status-theme" onClick={onToggleTheme} title="切换深浅色">
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </footer>
  );
}
