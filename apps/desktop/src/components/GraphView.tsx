import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphDto } from "../api";
import {
  applyGraphForces,
  dragLeashRadius,
  graphFitTransform,
  graphNodeRadius,
  maxDistanceFromLeader,
  releaseGraphPins,
  tetherNodesToLeader,
} from "../lib/graph";

type GraphNode = {
  id: string;
  label: string;
  type: string;
  degree: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
};

type GraphViewProps = {
  graph: GraphDto | null;
  theme: "dark" | "light";
  onOpen: (id: string) => void;
  focusId?: string | null;
  compact?: boolean;
  replayKey?: string;
};

const TYPE_COLOR: Record<"dark" | "light", Record<string, string>> = {
  dark: {
    concept: "#e6e6e6",
    entity: "#cfcfcf",
    source: "#b8b8b8",
    overview: "#a3a3a3",
    query: "#d4d4d4",
    comparison: "#adadad",
    synthesis: "#c2c2c2",
    archive: "#8a8a8a",
    missing: "#666666",
  },
  light: {
    concept: "#1a1a1a",
    entity: "#333333",
    source: "#4d4d4d",
    overview: "#666666",
    query: "#2a2a2a",
    comparison: "#404040",
    synthesis: "#555555",
    archive: "#7a7a7a",
    missing: "#999999",
  },
};

const THEME_PALETTE = {
  dark: { bg: "#1e1e1e", ink: "#dcddde", line: "#3f3f3f", accent: "#e6e6e6" },
  light: { bg: "#ffffff", ink: "#222222", line: "#d0d0d0", accent: "#222222" },
};

const GRAPH_PHYSICS_REV = Date.now();

export function GraphView({
  graph,
  theme,
  onOpen,
  focusId = null,
  compact = false,
  replayKey = "",
}: GraphViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const fitted = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const leashRef = useRef<number | null>(null);
  const colors = THEME_PALETTE[theme];

  const applyFit = useCallback((durationMs: number) => {
    const fg = fgRef.current;
    const { width, height } = sizeRef.current;
    if (!fg || width < 8 || height < 8) return;
    const next = graphFitTransform(fg.getGraphBbox(), { width, height }, compactRef.current);
    if (!next) return;
    fg.centerAt(next.cx, next.cy, durationMs);
    fg.zoom(next.k, durationMs);
  }, []);

  useEffect(() => {
    fitted.current = false;
  }, [graph, theme, focusId, replayKey]);

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

  useEffect(() => {
    if (!fitted.current) return;
    applyFit(0);
  }, [size.width, size.height, applyFit]);

  useLayoutEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    applyGraphForces(fg, compact, focusId);
    releaseGraphPins(data.nodes);
  }, [compact, size.width, size.height, data.nodes, replayKey, theme, focusId, GRAPH_PHYSICS_REV]);

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
          ref={fgRef as never}
          key={`${theme}:${focusId ?? ""}:${replayKey}:${data.nodes.length}`}
          width={size.width}
          height={size.height}
          backgroundColor={colors.bg}
          graphData={data}
          nodeId="id"
          nodeLabel="label"
          cooldownTicks={compact ? 60 : 120}
          d3AlphaDecay={compact ? 0.04 : 0.0228}
          d3VelocityDecay={0.4}
          minZoom={0.08}
          maxZoom={compact ? 4 : 6}
          onEngineStop={() => {
            if (fitted.current) return;
            fitted.current = true;
            applyFit(compact ? 180 : 240);
          }}
          linkColor={() => colors.line}
          linkWidth={compact ? 1.2 : 1}
          linkDirectionalArrowLength={compact ? 3 : 4}
          linkDirectionalArrowRelPos={1}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x?: number; y?: number };
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const focused = Boolean(focusId && n.id === focusId);
            const r = graphNodeRadius({ degree: n.degree, focused }, compact);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = TYPE_COLOR[theme][n.type] ?? (theme === "dark" ? "#a0a0a0" : "#808080");
            ctx.fill();
            if (focused) {
              ctx.strokeStyle = colors.accent;
              ctx.lineWidth = 2;
              ctx.stroke();
            }
            if (compact || globalScale > 1.1) {
              // Compact graph labels live in graph space so they shrink with the preview.
              const fontSize = compact ? Math.max(4, Math.min(12, 12 * globalScale)) : 12 / globalScale;
              ctx.font = `${focused ? "600 " : ""}${fontSize}px sans-serif`;
              ctx.fillStyle = colors.ink;
              ctx.fillText(n.label, x + r + 3, y + fontSize / 3);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode & { x?: number; y?: number };
            const r = graphNodeRadius({ degree: n.degree }, compact) + 4;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
            ctx.fill();
          }}
          onNodeDrag={(node) => {
            const id = String((node as GraphNode).id);
            const nodes = data.nodes;
            if (leashRef.current == null) {
              leashRef.current = dragLeashRadius(maxDistanceFromLeader(nodes, id), compactRef.current);
            }
            tetherNodesToLeader(nodes, id, leashRef.current);
          }}
          onNodeDragEnd={() => {
            leashRef.current = null;
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
