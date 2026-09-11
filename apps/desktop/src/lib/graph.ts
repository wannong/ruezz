import type { GraphDto, GraphNodeDto } from "../api";

const MAX_GRAPH_NODES = 80;

export type GraphViewScope = "global" | 1 | 2 | 3;

export function clampGraphScope(value: unknown): GraphViewScope {
  if (value === "global") return "global";
  const hops = Number(value);
  if (hops === 1 || hops === 2 || hops === 3) return hops;
  return 1;
}

function clampHops(depth: number): 1 | 2 | 3 {
  if (!Number.isFinite(depth)) return 1;
  return Math.min(3, Math.max(1, Math.floor(depth))) as 1 | 2 | 3;
}

/** Current page plus nodes within `depth` hops, with induced edges among that set. */
export function egoGraph(graph: GraphDto, pageId: string, depth = 1): GraphDto {
  const hops = clampHops(depth);
  const neighborIds = new Set<string>([pageId]);

  if (hops > 0) {
    const adj = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, new Set());
      if (!adj.has(edge.target)) adj.set(edge.target, new Set());
      adj.get(edge.source)!.add(edge.target);
      adj.get(edge.target)!.add(edge.source);
    }

    let frontier = [pageId];
    for (let d = 0; d < hops; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbor of adj.get(id) ?? []) {
          if (neighborIds.has(neighbor)) continue;
          neighborIds.add(neighbor);
          next.push(neighbor);
          if (neighborIds.size >= MAX_GRAPH_NODES) break;
        }
        if (neighborIds.size >= MAX_GRAPH_NODES) break;
      }
      frontier = next;
      if (frontier.length === 0 || neighborIds.size >= MAX_GRAPH_NODES) break;
    }
  }

  const nodes: GraphNodeDto[] = graph.nodes.filter((n) => neighborIds.has(n.id));
  const seen = new Set(nodes.map((n) => n.id));
  for (const id of neighborIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      type: "missing",
      label: id.split("/").pop() ?? id,
      degree: 0,
    });
  }

  const edges = graph.edges.filter(
    (edge) => neighborIds.has(edge.source) && neighborIds.has(edge.target),
  );

  return { nodes, edges, dataVersion: graph.dataVersion };
}

export type GraphBBox = { x: [number, number]; y: [number, number] };

export type GraphFit = { k: number; cx: number; cy: number };

/**
 * Fit a graph bbox into a pane. Tiny ego subgraphs must not zoom until a
 * single node fills the sidebar — zoomToFit does that when the bbox is
 * only a node diameter.
 */
export function graphFitTransform(
  bbox: GraphBBox | null | undefined,
  pane: { width: number; height: number },
  compact = false,
): GraphFit | null {
  if (!bbox || pane.width < 8 || pane.height < 8) return null;

  // Symmetric padding so zoom stays centered in the pane. Compact view
  // keeps extra room for the hop buttons on the left.
  const pad = compact ? 56 : 36;
  const availW = Math.max(64, pane.width - pad * 2);
  const availH = Math.max(64, pane.height - pad * 2);

  const cx = (bbox.x[0] + bbox.x[1]) / 2;
  const cy = (bbox.y[0] + bbox.y[1]) / 2;
  const spanX = Math.max(1, bbox.x[1] - bbox.x[0]);
  const spanY = Math.max(1, bbox.y[1] - bbox.y[0]);
  if (![cx, cy, spanX, spanY].every(Number.isFinite)) return null;

  const fillK = Math.min(availW / spanX, availH / spanY);
  // Only cap tiny ego graphs (one node / a few overlapping). Larger
  // layouts still fill the pane the way zoomToFit would.
  const tiny = Math.max(spanX, spanY) < 56;
  const maxK = tiny ? (compact ? 1.9 : 2.4) : compact ? 5 : 6.5;
  const k = Math.max(0.08, Math.min(maxK, fillK));
  return { k, cx, cy };
}

type GraphForce = {
  strength?: (value: number) => unknown;
  distance?: (value: number) => unknown;
  distanceMin?: (value: number) => unknown;
  distanceMax?: (value: number) => unknown;
};

export type GraphForceApi = {
  d3Force: (name: string) => unknown;
};

/**
 * Default many-body charge has infinite range, so a drag (which reheats
 * the sim) pushes every other node away forever. Keep local push / link
 * follow, but cut repulsion beyond a few link-lengths.
 */
export function applyGraphForces(fg: GraphForceApi, compact = false) {
  const charge = fg.d3Force("charge") as GraphForce | undefined;
  charge?.strength?.(compact ? -42 : -48);
  charge?.distanceMin?.(4);
  charge?.distanceMax?.(compact ? 140 : 180);

  const link = fg.d3Force("link") as GraphForce | undefined;
  link?.distance?.(compact ? 32 : 40);
  link?.strength?.(1);

  const center = fg.d3Force("center") as GraphForce | undefined;
  center?.strength?.(0.12);
}

export function releaseGraphPins(nodes: Array<{ fx?: number; fy?: number }>) {
  for (const node of nodes) {
    delete node.fx;
    delete node.fy;
  }
}

export type SimNode = {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

export function maxDistanceFromLeader(nodes: SimNode[], leaderId: string): number {
  const leader = nodes.find((n) => n.id === leaderId);
  if (!leader || !Number.isFinite(leader.x) || !Number.isFinite(leader.y)) return 0;
  let max = 0;
  for (const n of nodes) {
    if (n.id === leaderId || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const d = Math.hypot((n.x ?? 0) - (leader.x ?? 0), (n.y ?? 0) - (leader.y ?? 0));
    if (d > max) max = d;
  }
  return max;
}

export function dragLeashRadius(span: number, compact = false): number {
  return Math.max(compact ? 100 : 140, span * 1.06);
}

/** Pull stragglers back when a drag carries the leader too far from the cluster. */
export function tetherNodesToLeader(nodes: SimNode[], leaderId: string, maxDist: number, pull = 0.55) {
  if (!(maxDist > 0) || pull <= 0) return;
  const leader = nodes.find((n) => n.id === leaderId);
  if (!leader || !Number.isFinite(leader.x) || !Number.isFinite(leader.y)) return;
  const lx = leader.x ?? 0;
  const ly = leader.y ?? 0;
  for (const n of nodes) {
    if (n.id === leaderId || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const dx = (n.x ?? 0) - lx;
    const dy = (n.y ?? 0) - ly;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDist || dist < 1e-6) continue;
    const k = ((dist - maxDist) / dist) * pull;
    n.x = (n.x ?? 0) - dx * k;
    n.y = (n.y ?? 0) - dy * k;
    if (n.vx != null) n.vx *= 0.65;
    if (n.vy != null) n.vy *= 0.65;
  }
}
