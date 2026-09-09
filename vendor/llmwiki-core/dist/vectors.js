/**
 * Pluggable vector index + reciprocal rank fusion (differentiator C, vector
 * half). The index is an interface so the default is *off* and any provider
 * (local Ollama, OpenAI, a native lib) can be supplied; the in-memory cosine
 * implementation is the zero-dependency default for tests and small wikis.
 */
/** Cosine similarity; returns NaN for a zero vector. */
export function cosineSimilarity(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? Number.NaN : dot / denom;
}
/** In-memory cosine-similarity vector index. */
export class InMemoryVectorIndex {
    ids = [];
    vecs = [];
    upsert(id, vector) {
        const i = this.ids.indexOf(id);
        if (i >= 0)
            this.vecs[i] = vector;
        else {
            this.ids.push(id);
            this.vecs.push(vector);
        }
    }
    query(vector, k) {
        const scored = this.ids
            .map((id, i) => ({ id, score: cosineSimilarity(vector, this.vecs[i]) }))
            .filter((s) => !Number.isNaN(s.score));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, k);
    }
    size() {
        return this.ids.length;
    }
}
/**
 * Reciprocal rank fusion: combine multiple ranked id lists into one, rewarding
 * items that appear high in many lists. `k` (default 60) dampens the rank term.
 */
export function reciprocalRankFusion(rankings, k = 60) {
    const scores = new Map();
    for (const ranking of rankings) {
        ranking.forEach((id, rank) => {
            scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
        });
    }
    return [...scores.entries()]
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=vectors.js.map