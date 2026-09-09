import type { ContextBudget } from "./context-budget.js";
import type { Graph, Page } from "./types.js";
import type { Store } from "./store.js";
import { type Embedder, type VectorIndex } from "./vectors.js";
/**
 * Hybrid retrieval (differentiator C). BM25 (FTS5) seeds the result set;
 * when an optional vector index + embedder are supplied, BM25 and vector
 * rankings are fused via reciprocal rank fusion. A 1-hop graph expansion then
 * adds the neighborhood — the compounding payoff. Works with no vectors at all.
 *
 * Output: a ranked hit list plus a budget-packed context block ready to inject
 * into an `ask` prompt (ADR-19 retrieval+injection).
 */
export interface RetrievalInput {
    query: string;
    store: Store;
    graph: Graph;
    pages: Page[];
    budget: ContextBudget;
    vectorIndex?: VectorIndex;
    embedder?: Embedder;
    opts?: {
        topK?: number;
        expansionDecay?: number;
    };
}
export interface RetrievalHit {
    pageId: string;
    score: number;
    reason: "bm25" | "graph-neighbor";
}
export interface RetrievalResult {
    hits: RetrievalHit[];
    contextBlock: string;
}
export declare function retrieve(input: RetrievalInput): Promise<RetrievalResult>;
//# sourceMappingURL=retrieval.d.ts.map