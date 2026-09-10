const MAX_NEIGHBORS = 48;

type GraphLike = {
  edges: Array<{ source: string; target: string }>;
};

/** IDs within `depth` hops of `startId`, excluding the start page. */
export function collectNeighborIds(graph: GraphLike, startId: string, depth: number): string[] {
  const hops = Math.max(0, Math.min(3, Math.floor(depth)));
  if (!startId || hops <= 0) return [];

  const adj = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    if (!adj.has(edge.target)) adj.set(edge.target, new Set());
    adj.get(edge.source)!.add(edge.target);
    adj.get(edge.target)!.add(edge.source);
  }

  const seen = new Set<string>([startId]);
  let frontier = [startId];
  const out: string[] = [];

  for (let d = 0; d < hops; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        out.push(neighbor);
        next.push(neighbor);
        if (out.length >= MAX_NEIGHBORS) return out;
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return out;
}
