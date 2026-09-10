import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme";
import { vaultName } from "../lib/fileTree";

type StatusBarProps = {
  vaultPath: string;
  pageCount: number;
  currentId: string | null;
  busy: boolean;
  theme: Theme;
  onToggleTheme: () => void;
};

export function StatusBar({
  vaultPath,
  pageCount,
  currentId,
  busy,
  theme,
  onToggleTheme,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-item" title={vaultPath}>
        {vaultName(vaultPath)}
      </span>
      <span className="status-item">{pageCount} 页</span>
      {currentId && <span className="status-item">{currentId}</span>}
      <span className="status-item muted">只读</span>
      {busy && <span className="status-item">工作中…</span>}
      <span className="status-spacer" />
      <button type="button" className="icon-btn status-theme" onClick={onToggleTheme} title="切换深浅色">
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </footer>
  );
}
