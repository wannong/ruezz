/**
 * Pluggable vector index + reciprocal rank fusion (differentiator C, vector
 * half). The index is an interface so the default is *off* and any provider
 * (local Ollama, OpenAI, a native lib) can be supplied; the in-memory cosine
 * implementation is the zero-dependency default for tests and small wikis.
 */
export interface VectorIndex {
    upsert(id: string, vector: number[]): void;
    query(vector: number[], k: number): Array<{
        id: string;
        score: number;
    }>;
    size(): number;
}
export interface Embedder {
    embed(text: string): Promise<number[]>;
}
/** Cosine similarity; returns NaN for a zero vector. */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/** In-memory cosine-similarity vector index. */
export declare class InMemoryVectorIndex implements VectorIndex {
    private ids;
    private vecs;
    upsert(id: string, vector: number[]): void;
    query(vector: number[], k: number): Array<{
        id: string;
        score: number;
    }>;
    size(): number;
}
/**
 * Reciprocal rank fusion: combine multiple ranked id lists into one, rewarding
 * items that appear high in many lists. `k` (default 60) dampens the rank term.
 */
export declare function reciprocalRankFusion(rankings: string[][], k?: number): Array<{
    id: string;
    score: number;
}>;
//# sourceMappingURL=vectors.d.ts.map