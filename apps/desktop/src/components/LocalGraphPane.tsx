import { useMemo } from "react";
import { Share2 } from "lucide-react";
import type { GraphDto } from "../api";
import { egoGraph, type GraphViewScope } from "../lib/graph";
import type { Theme } from "../theme";
import { GraphView } from "./GraphView";

const HOP_LABELS: Record<1 | 2 | 3, string> = {
  1: "1 层邻居",
  2: "2 层邻居",
  3: "3 层邻居",
};

type LocalGraphPaneProps = {
  graph: GraphDto | null;
  pageId: string | null;
  theme: Theme;
  scope: GraphViewScope;
  onScope: (scope: GraphViewScope) => void;
  onOpen: (id: string) => void;
};

export function LocalGraphPane({ graph, pageId, theme, scope, onScope, onOpen }: LocalGraphPaneProps) {
  const shown = useMemo(() => {
    if (!graph) return null;
    if (scope === "global") return graph;
    if (!pageId) return null;
    return egoGraph(graph, pageId, scope);
  }, [graph, pageId, scope]);

  const waitingForPage = scope !== "global" && !pageId;
  const loading = Boolean(pageId || scope === "global") && (!graph || !shown);

  return (
    <div className="local-graph">
      {waitingForPage && <div className="empty">打开一篇笔记查看相连图谱</div>}
      {loading && <div className="empty loading-breathe">正在加载图谱…</div>}
      {!waitingForPage && shown && (
        <GraphView
          graph={shown}
          theme={theme}
          focusId={pageId}
          compact
          replayKey={String(scope)}
          onOpen={onOpen}
        />
      )}
      <div className="graph-hops" role="radiogroup" aria-label="图谱范围">
        <button
          type="button"
          role="radio"
          aria-checked={scope === "global"}
          className={`graph-hop${scope === "global" ? " active" : ""}`}
          title="全局图谱"
          onClick={() => onScope("global")}
        >
          <Share2 size={16} />
        </button>
        {([1, 2, 3] as const).map((depth) => (
          <button
            key={depth}
            type="button"
            role="radio"
            aria-checked={scope === depth}
            className={`graph-hop${scope === depth ? " active" : ""}`}
            title={HOP_LABELS[depth]}
            onClick={() => onScope(depth)}
          >
            {depth}
          </button>
        ))}
      </div>
    </div>
  );
}
