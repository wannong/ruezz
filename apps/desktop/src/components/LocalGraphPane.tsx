import { useMemo } from "react";
import type { GraphDto } from "../api";
import { egoGraph } from "../lib/graph";
import type { Theme } from "../theme";
import { GraphView } from "./GraphView";

type LocalGraphPaneProps = {
  graph: GraphDto | null;
  pageId: string | null;
  theme: Theme;
  onOpen: (id: string) => void;
};

export function LocalGraphPane({ graph, pageId, theme, onOpen }: LocalGraphPaneProps) {
  const local = useMemo(() => {
    if (!graph || !pageId) return null;
    return egoGraph(graph, pageId);
  }, [graph, pageId]);

  if (!pageId) {
    return <div className="empty">打开一篇笔记查看相连图谱</div>;
  }
  if (!graph || !local) {
    return <div className="empty">正在加载图谱…</div>;
  }
  if (local.edges.length === 0) {
    return <div className="empty">当前笔记没有一次相连的节点</div>;
  }

  return (
    <div className="local-graph">
      <GraphView graph={local} theme={theme} focusId={pageId} compact onOpen={onOpen} />
    </div>
  );
}
