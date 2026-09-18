import { BookOpen, Search, Settings, Share2, Star } from "lucide-react";
import { BotGlyph, FilePlusGlyph, FolderTreeGlyph, PasteGlyph } from "./iconGlyphs";

type RibbonProps = {
  leftView: "files" | "search" | "favorites" | "library";
  leftCollapsed: boolean;
  agentOpen: boolean;
  graphOpen: boolean;
  busy: boolean;
  onFiles: () => void;
  onSearch: () => void;
  onFavorites: () => void;
  onLibrary: () => void;
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
  onFavorites,
  onLibrary,
  onAgent,
  onGraph,
  onIngest,
  onSettings,
}: RibbonProps) {
  return (
    <nav className="ribbon" aria-label="侧栏图标">
      <button
        type="button"
        className={`icon-btn${ !leftCollapsed && leftView === "library" ? " active" : ""}`}
        title="文献库"
        onClick={onLibrary}
      >
        <BookOpen size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${ !leftCollapsed && leftView === "files" ? " active" : ""}`}
        data-icon="files"
        title="文件列表"
        onClick={onFiles}
      >
        <FolderTreeGlyph />
      </button>
      <button
        type="button"
        className={`icon-btn${ !leftCollapsed && leftView === "search" ? " active" : ""}`}
        data-icon="search"
        title="搜索"
        onClick={onSearch}
      >
        <Search size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${ !leftCollapsed && leftView === "favorites" ? " active" : ""}`}
        title="收藏"
        onClick={onFavorites}
      >
        <Star size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn${agentOpen ? " active" : ""}`}
        data-icon="bot"
        title="Agent"
        onClick={onAgent}
      >
        <BotGlyph />
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
      <button
        type="button"
        className="icon-btn"
        data-icon="ingest"
        title="入库"
        disabled={busy}
        onClick={onIngest}
      >
        <FilePlusGlyph />
      </button>
      <button
        type="button"
        className="icon-btn"
        data-icon="paste"
        title="粘贴入库"
        disabled={busy}
        onClick={onIngest}
      >
        <PasteGlyph />
      </button>
      <button type="button" className="icon-btn" data-icon="settings" title="设置" onClick={onSettings}>
        <Settings size={18} />
      </button>
    </nav>
  );
}
