import type { Graph, Page } from "./types.js";
export interface HealthScorecard {
    /** Fraction of link/cite targets that resolve to a real node. */
    coverage: number;
    /** Mean declared sources per content page, clamped to 1. */
    citationDensity: number;
    /** 1 - stale/total. */
    freshness: number;
    /** 1 - orphans/total (higher = better). */
    orphanRate: number;
    /** 1 - (components-1)/(pages-1); fewer disconnected clusters = higher. */
    connectivity: number;
    /** Geometric mean of the five metrics. */
    composite: number;
}
export declare function scoreHealth(input: {
    pages: Page[];
    graph: Graph;
    staleCount?: number;
}): HealthScorecard;
//# sourceMappingURL=eval.d.ts.map