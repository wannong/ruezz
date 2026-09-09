import { describe, expect, it } from "vitest";
import { cosineSimilarity, InMemoryVectorIndex, reciprocalRankFusion } from "./vectors.js";
describe("cosineSimilarity", () => {
    it("is 1 for identical vectors", () => {
        expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 6);
    });
    it("is 0 for orthogonal vectors", () => {
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
    });
    it("is -1 for opposite vectors", () => {
        expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
    });
});
describe("InMemoryVectorIndex", () => {
    it("returns the nearest neighbors by cosine similarity", () => {
        const idx = new InMemoryVectorIndex();
        idx.upsert("a", [1, 0]);
        idx.upsert("b", [0, 1]);
        idx.upsert("c", [0.9, 0.1]);
        const hits = idx.query([1, 0], 2);
        expect(hits[0]?.id).toBe("a");
        expect(hits[1]?.id).toBe("c");
        expect(hits.map((h) => h.id)).not.toContain("b");
    });
    it("upsert replaces an existing vector", () => {
        const idx = new InMemoryVectorIndex();
        idx.upsert("a", [1, 0]);
        idx.upsert("a", [0, 1]);
        expect(idx.size()).toBe(1);
        expect(idx.query([0, 1], 1)[0]?.id).toBe("a");
    });
});
describe("reciprocalRankFusion", () => {
    it("fuses multiple rankings, rewarding agreement", () => {
        const fused = reciprocalRankFusion([["a", "b", "c"], ["a", "c"]]);
        // a tops both rankings -> first; c appears in both -> second; b once -> last
        expect(fused.map((f) => f.id)).toEqual(["a", "c", "b"]);
    });
});
//# sourceMappingURL=vectors.test.js.map