import type { GraphDto, GraphNodeDto } from "../api";

/** Current page + nodes one hop away, with induced edges among that set. */
export function egoGraph(graph: GraphDto, pageId: string): GraphDto {
  const neighborIds = new Set<string>([pageId]);
  for (const edge of graph.edges) {
    if (edge.source === pageId || edge.target === pageId) {
      neighborIds.add(edge.source);
      neighborIds.add(edge.target);
    }
  }

  const nodes: GraphNodeDto[] = graph.nodes.filter((n) => neighborIds.has(n.id));
  const seen = new Set(nodes.map((n) => n.id));
  for (const id of neighborIds) {
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({
        id,
        type: "missing",
        label: id.split("/").pop() ?? id,
        degree: 0,
      });
    }
  }

  const edges = graph.edges.filter(
    (edge) => neighborIds.has(edge.source) && neighborIds.has(edge.target),
  );

  return { nodes, edges, dataVersion: graph.dataVersion };
}
