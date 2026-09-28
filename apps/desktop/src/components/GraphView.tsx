import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphDto } from "../api";
import {
  applyGraphForces,
  dragLeashRadius,
  graphDepths,
  graphFitTransform,
  graphFocusFitTransform,
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
  dark: {
    bg: "#1e1e1e",
    ink: "#dcddde",
    line: "#3f3f3f",
    accent: "#fff4d6",
    neutral: "#686d75",
    depth: ["#ef806b", "#dfa94f", "#58ae9d", "#6f91cf"],
  },
  light: {
    bg: "#ffffff",
    ink: "#222222",
    line: "#d0d0d0",
    accent: "#171717",
    neutral: "#a7adb5",
    depth: ["#cf503e", "#b97816", "#278977", "#4e70b2"],
  },
};

const GRAPH_PHYSICS_REV = Date.now();
const SPAWN_MS = 420;
const FOCUS_PAN_MS = 620;
const HOP_FIT_MS = 480;
const EGO_SCOPES = new Set(["1", "2", "3"]);

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function findFocusCoords(nodes: GraphNode[], focusId: string | null): { x: number; y: number } | null {
  if (!focusId) return null;
  const focus = nodes.find((node) => node.id === focusId);
  if (!focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.y)) return null;
  return { x: focus.x ?? 0, y: focus.y ?? 0 };
}

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
  const skipNextFitRef = useRef(false);
  const prevReplayKeyRef = useRef(replayKey);
  const prevFocusRef = useRef(focusId);
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const pendingFocusPanRef = useRef(false);
  const spawnProgressRef = useRef(new Map<string, number>());
  const spawnRafRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const leashRef = useRef<number | null>(null);
  const colors = THEME_PALETTE[theme];
  const depths = useMemo(() => (graph && focusId ? graphDepths(graph, focusId) : null), [graph, focusId]);

  const stopSpawnLoop = useCallback(() => {
    if (spawnRafRef.current != null) {
      cancelAnimationFrame(spawnRafRef.current);
      spawnRafRef.current = null;
    }
    setSpawning(false);
  }, []);

  const startSpawnLoop = useCallback(() => {
    stopSpawnLoop();
    setSpawning(true);
    const started = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / SPAWN_MS);
      const eased = easeOutCubic(t);
      for (const id of spawnProgressRef.current.keys()) {
        spawnProgressRef.current.set(id, eased);
      }
      if (t < 1) {
        spawnRafRef.current = requestAnimationFrame(frame);
      } else {
        spawnProgressRef.current.clear();
        spawnRafRef.current = null;
        setSpawning(false);
      }
    };
    spawnRafRef.current = requestAnimationFrame(frame);
  }, [stopSpawnLoop]);

  const shouldFocusFit = Boolean(compact && focusId && EGO_SCOPES.has(replayKey));

  const applyFit = useCallback((durationMs: number) => {
    const fg = fgRef.current;
    const { width, height } = sizeRef.current;
    if (!fg || width < 8 || height < 8) return;
    const next = graphFitTransform(fg.getGraphBbox(), { width, height }, compactRef.current);
    if (!next) return;
    fg.centerAt(next.cx, next.cy, durationMs);
    fg.zoom(next.k, durationMs);
  }, []);

  const applyFocusFit = useCallback(
    (durationMs: number) => {
      const fg = fgRef.current;
      const { width, height } = sizeRef.current;
      if (!fg || !focusId || width < 8 || height < 8) return false;
      const next = graphFocusFitTransform(dataRef.current.nodes, focusId, { width, height }, compactRef.current);
      if (!next) return false;
      fg.centerAt(next.cx, next.cy, durationMs);
      fg.zoom(next.k, durationMs);
      return true;
    },
    [focusId],
  );

  const dataRef = useRef({ nodes: [] as GraphNode[], links: [] as Array<{ source: string; target: string }> });

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

  dataRef.current = data;

  const centerOnFocus = useCallback((durationMs: number) => {
    const fg = fgRef.current;
    if (!fg || !focusId) return false;
    const coords = findFocusCoords(dataRef.current.nodes, focusId);
    if (!coords) return false;
    fg.centerAt(coords.x, coords.y, durationMs);
    return true;
  }, [focusId]);

  const centerOnFocusRef = useRef(centerOnFocus);
  centerOnFocusRef.current = centerOnFocus;

  const graphEpoch = `${theme}:${graph?.dataVersion ?? 0}`;

  const animateFocusPan = useCallback(() => {
    const run = () => centerOnFocusRef.current(FOCUS_PAN_MS);
    if (run()) {
      pendingFocusPanRef.current = false;
      return;
    }
    requestAnimationFrame(() => {
      if (run()) pendingFocusPanRef.current = false;
    });
  }, []);

  useEffect(() => {
    fitted.current = false;
    prevNodeIdsRef.current = new Set();
    pendingFocusPanRef.current = false;
    spawnProgressRef.current.clear();
    stopSpawnLoop();
  }, [graphEpoch, stopSpawnLoop]);

  useEffect(() => {
    const prev = prevReplayKeyRef.current;
    prevReplayKeyRef.current = replayKey;
    const egoHopChange = EGO_SCOPES.has(prev) && EGO_SCOPES.has(replayKey) && prev !== replayKey;
    const globalHopChange = (prev === "global") !== (replayKey === "global");
    if (egoHopChange) skipNextFitRef.current = true;
    if (globalHopChange) fitted.current = false;
  }, [replayKey]);

  useEffect(() => {
    const prev = prevFocusRef.current;
    prevFocusRef.current = focusId;
    if (!focusId || prev === focusId || !fitted.current) return;
    pendingFocusPanRef.current = true;
    requestAnimationFrame(animateFocusPan);
    const retry1 = window.setTimeout(animateFocusPan, 180);
    const retry2 = window.setTimeout(animateFocusPan, 420);
    const cancelPending = window.setTimeout(() => {
      pendingFocusPanRef.current = false;
    }, FOCUS_PAN_MS + 400);
    return () => {
      window.clearTimeout(retry1);
      window.clearTimeout(retry2);
      window.clearTimeout(cancelPending);
    };
  }, [focusId, animateFocusPan]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const applySize = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [graph, theme]);

  useLayoutEffect(() => {
    const prevIds = prevNodeIdsRef.current;
    const nextIds = new Set(data.nodes.map((node) => node.id));
    const added = data.nodes.filter((node) => !prevIds.has(node.id));
    const origin = findFocusCoords(data.nodes, focusId);

    if (added.length > 0 && origin && prevIds.size > 0) {
      for (const node of added) {
        if (node.id === focusId) continue;
        node.x = origin.x + (Math.random() - 0.5) * 6;
        node.y = origin.y + (Math.random() - 0.5) * 6;
        node.vx = 0;
        node.vy = 0;
        spawnProgressRef.current.set(node.id, 0);
      }
      if (spawnProgressRef.current.size > 0) startSpawnLoop();
      fgRef.current?.d3ReheatSimulation?.();
    }

    prevNodeIdsRef.current = nextIds;
  }, [data.nodes, focusId, startSpawnLoop]);

  useEffect(() => {
    if (!fitted.current) return;
    centerOnFocusRef.current(0);
  }, [size.width, size.height]);

  useLayoutEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    applyGraphForces(fg, compact, focusId);
    releaseGraphPins(data.nodes);
  }, [compact, size.width, size.height, data.nodes, replayKey, theme, focusId, GRAPH_PHYSICS_REV]);

  useEffect(() => () => stopSpawnLoop(), [stopSpawnLoop]);

  if (!graph) {
    return <div className="empty-center">正在加载图谱…</div>;
  }
  if (graph.nodes.length === 0) {
    return <div className="empty-center">知识图谱为空，先入库资料</div>;
  }

  const graphKey = `${theme}:${graph.dataVersion ?? 0}`;

  return (
    <div className="graph-wrap" ref={wrap}>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          ref={fgRef as never}
          key={graphKey}
          width={size.width}
          height={size.height}
          backgroundColor={colors.bg}
          autoPauseRedraw={!spawning}
          graphData={data}
          nodeId="id"
          nodeLabel="label"
          cooldownTicks={compact ? 60 : 120}
          d3AlphaDecay={compact ? 0.04 : 0.0228}
          d3VelocityDecay={0.4}
          minZoom={0.08}
          maxZoom={compact ? 4 : 6}
          onEngineStop={() => {
            if (pendingFocusPanRef.current) {
              animateFocusPan();
            }
            if (skipNextFitRef.current) {
              skipNextFitRef.current = false;
              if (!fitted.current) fitted.current = true;
              applyFocusFit(HOP_FIT_MS);
              return;
            }
            if (fitted.current) return;
            fitted.current = true;
            if (shouldFocusFit) applyFocusFit(compact ? 360 : HOP_FIT_MS);
            else applyFit(compact ? 360 : 480);
          }}
          linkColor={(link) => {
            const sourceId =
              typeof link.source === "object" ? String((link.source as GraphNode).id) : String(link.source);
            const targetId =
              typeof link.target === "object" ? String((link.target as GraphNode).id) : String(link.target);
            const grow = Math.min(
              spawnProgressRef.current.get(sourceId) ?? 1,
              spawnProgressRef.current.get(targetId) ?? 1,
            );
            if (grow >= 0.98) return colors.line;
            const alpha = 0.12 + grow * 0.88;
            return theme === "dark" ? `rgba(63, 63, 63, ${alpha})` : `rgba(208, 208, 208, ${alpha})`;
          }}
          linkWidth={compact ? 1.2 : 1}
          linkDirectionalArrowLength={compact ? 3 : 4}
          linkDirectionalArrowRelPos={1}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x?: number; y?: number };
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const grow = easeOutCubic(spawnProgressRef.current.get(n.id) ?? 1);
            if (grow < 0.02) return;

            const focused = Boolean(focusId && n.id === focusId);
            const hovered = hoveredId === n.id;
            const baseR = graphNodeRadius({ degree: n.degree, focused }, compact);
            const r = baseR * grow * (hovered ? 1.18 : 1);

            if (focused) {
              ctx.beginPath();
              ctx.arc(x, y, (r + (compact ? 4 : 5)) * grow, 0, Math.PI * 2);
              ctx.fillStyle = theme === "dark" ? "rgba(255, 244, 214, 0.18)" : "rgba(23, 23, 23, 0.12)";
              ctx.fill();
              ctx.strokeStyle = colors.accent;
              ctx.lineWidth = compact ? 1.8 : 2.4;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            const depth = depths?.get(n.id);
            ctx.fillStyle = depths
              ? depth != null && depth <= 3
                ? colors.depth[depth]
                : colors.neutral
              : TYPE_COLOR[theme][n.type] ?? (theme === "dark" ? "#a0a0a0" : "#808080");
            ctx.fill();
            if (focused) {
              ctx.strokeStyle = colors.bg;
              ctx.lineWidth = compact ? 1.2 : 1.6;
              ctx.stroke();
            }
            if (compact || globalScale > 1.1) {
              const fontSize = Math.max(compact ? 4 : 8, Math.min(compact ? 12 : 18, 12 / globalScale));
              ctx.font = `${focused ? "600 " : ""}${fontSize}px sans-serif`;
              const maxWidth = compact ? 104 : 168;
              const sourceLabel = n.label || n.id;
              let label = sourceLabel;
              if (ctx.measureText(label).width > maxWidth) {
                while (label.length > 1 && ctx.measureText(`${label}...`).width > maxWidth) {
                  label = label.slice(0, -1);
                }
                label = `${label}...`;
              }
              const labelWidth = ctx.measureText(label).width;
              const labelX = x - labelWidth / 2;
              const labelY = y + r + fontSize + (compact ? 3 : 5);
              ctx.globalAlpha = grow;
              ctx.fillStyle = theme === "dark" ? "rgba(30, 30, 30, 0.5)" : "rgba(255, 255, 255, 0.5)";
              ctx.fillRect(labelX - 2, labelY - fontSize, labelWidth + 4, fontSize + 3);
              ctx.fillStyle = colors.ink;
              ctx.fillText(label, labelX, labelY);
              ctx.globalAlpha = 1;
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode & { x?: number; y?: number };
            const grow = spawnProgressRef.current.get(n.id) ?? 1;
            if (grow < 0.02) return;
            const r = graphNodeRadius({ degree: n.degree }, compact) * easeOutCubic(grow) + 4;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
            ctx.fill();
          }}
          onNodeHover={(node) => setHoveredId(node ? String((node as GraphNode).id) : null)}
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
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}
