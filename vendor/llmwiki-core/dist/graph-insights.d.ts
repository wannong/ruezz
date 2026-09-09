import type { Graph, GraphNode } from "./types.js";
/**
 * Structural insights over the link graph (pure). These turn the graph from
 * decoration into an actionable research tool: where are the gaps, the hubs,
 * the disconnected clusters? Consumed by the maintenance planner (M3) and the
 * graph/impact surfaces.
 */
export interface KnowledgeGap {
    /** A link target referenced by pages but with no page of its own. */
    target: string;
    /** Pages that reference it. */
    referencedBy: string[];
}
/** Dangling link targets aggregated into proposed-page candidates (most-referenced first). */
export declare function findKnowledgeGaps(graph: Graph): KnowledgeGap[];
/** High-degree nodes (hubs), descending by degree. */
export declare function findHubs(graph: Graph, minDegree?: number): GraphNode[];
/** Connected components of the (undirected) link graph, each a list of node ids. */
export declare function connectedComponents(graph: Graph): string[][];
//# sourceMappingURL=graph-insights.d.ts.map