import {
  Bot,
  ClipboardPaste,
  FilePlus,
  FolderTree,
  Search,
  Settings,
  Share2,
} from "lucide-react";

type RibbonProps = {
  leftView: "files" | "search";
  leftCollapsed: boolean;
  agentOpen: boolean;
  graphOpen: boolean;
  busy: boolean;
  onFiles: () => void;
  onSearch: () => void;
  onAgent: () => void;
  onGraph: () => void;
  onIngest: () => void;
  onSettings: () => void;
};

export function Ribbon({
  leftView,
  leftCollapsed,
  agentOpen,
  graphOpen,
  busy,
  onFiles,
  onSearch,
  onAgent,
  onGraph,
  onIngest,
  onSettings,
}: RibbonProps) {
  return (
    <nav className="ribbon" aria-label="侧栏图标">
      <button
        type="button"
        className={`icon-btn${ !leftCollapsed && leftView === "files" ? " active" : ""}`}
        title="文件列表"
        onClick={onFiles}
      >
        <FolderTree size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${ !leftCollapsed && leftView === "search" ? " active" : ""}`}
        title="搜索"
        onClick={onSearch}
      >
        <Search size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${agentOpen ? " active" : ""}`}
        title="Agent"
        onClick={onAgent}
      >
        <Bot size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${graphOpen ? " active" : ""}`}
        title="知识图谱"
        onClick={onGraph}
      >
        <Share2 size={18} />
      </button>
      <div className="ribbon-spacer" />
      <button type="button" className="icon-btn" title="入库" disabled={busy} onClick={onIngest}>
        <FilePlus size={18} />
      </button>
      <button type="button" className="icon-btn" title="粘贴入库" disabled={busy} onClick={onIngest}>
        <ClipboardPaste size={18} />
      </button>
      <button type="button" className="icon-btn" title="设置" onClick={onSettings}>
        <Settings size={18} />
      </button>
    </nav>
  );
}
