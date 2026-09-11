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
