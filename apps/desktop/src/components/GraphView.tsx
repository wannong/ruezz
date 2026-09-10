import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphDto } from "../api";

type GraphNode = {
  id: string;
  label: string;
  type: string;
  degree: number;
};

type GraphViewProps = {
  graph: GraphDto | null;
  theme: "dark" | "light";
  onOpen: (id: string) => void;
};

const TYPE_COLOR: Record<string, string> = {
  concept: "#7f6df2",
  entity: "#63b3ed",
  source: "#68d391",
  overview: "#f6ad55",
  query: "#f687b3",
  comparison: "#4fd1c5",
  synthesis: "#fc8181",
  archive: "#a0aec0",
  missing: "#718096",
};

const THEME_PALETTE = {
  dark: { bg: "#1e1e1e", ink: "#dcddde", line: "#3f3f3f" },
  light: { bg: "#ffffff", ink: "#222222", line: "#d0d0d0" },
};

export function GraphView({ graph, theme, onOpen }: GraphViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const colors = THEME_PALETTE[theme];

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const applySize = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [graph, theme]);

  const data = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], links: [] as Array<{ source: string; target: string }> };
    const nodes: GraphNode[] = graph.nodes.map((n) => ({
      id: n.id,
      label: n.label || n.id,
      type: n.type,
      degree: n.degree,
    }));
    const seen = new Set(nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      for (const id of [edge.source, edge.target]) {
        if (!seen.has(id)) {
          seen.add(id);
          nodes.push({ id, label: id, type: "missing", degree: 0 });
        }
      }
    }
    return {
      nodes,
      links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
    };
  }, [graph]);

  if (!graph) {
    return <div className="empty-center">正在加载图谱…</div>;
  }
  if (graph.nodes.length === 0) {
    return <div className="empty-center">知识图谱为空，先入库资料</div>;
  }

  return (
    <div className="graph-wrap" ref={wrap}>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          key={theme}
          width={size.width}
          height={size.height}
          backgroundColor={colors.bg}
          graphData={data}
          nodeId="id"
          nodeLabel="label"
          linkColor={() => colors.line}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x?: number; y?: number };
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const r = 4 + Math.min(8, n.degree * 0.35);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = TYPE_COLOR[n.type] ?? "#a0aec0";
            ctx.fill();
            if (globalScale > 1.1) {
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = colors.ink;
              ctx.fillText(n.label, x + r + 2, y + fontSize / 3);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode & { x?: number; y?: number };
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, 10, 0, Math.PI * 2);
            ctx.fill();
          }}
          onNodeClick={(node) => {
            const id = String((node as GraphNode).id);
            if ((node as GraphNode).type === "source") return;
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}
