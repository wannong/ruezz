import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.js";
import { scoreHealth } from "./eval.js";
function mkFm(partial) {
    return {
        type: "concept",
        title: partial.title ?? "t",
        tags: partial.tags ?? ["a", "b"],
        related: partial.related ?? [],
        sources: partial.sources ?? [],
        created: "2026-01-01",
        updated: "2026-01-01",
        confidence: partial.confidence,
    };
}
function page(id, body = "", fm = {}) {
    return { id, path: `wiki/${id}.md`, fm: Object.keys(fm).length ? mkFm(fm) : null, body, raw: body };
}
describe("scoreHealth", () => {
    it("scores a fully healthy wiki at 1.0 across the board", () => {
        const a = page("a", "[[b]]", { title: "A", sources: ["s1"] });
        const b = page("b", "[[a]]", { title: "B", sources: ["s1"] });
        const g = buildGraph([a, b], [{ id: "s1", path: "raw/sources/s1.md" }]);
        const h = scoreHealth({ pages: [a, b], graph: g, staleCount: 0 });
        expect(h.coverage).toBe(1);
        expect(h.citationDensity).toBe(1);
        expect(h.freshness).toBe(1);
        expect(h.orphanRate).toBe(1);
        expect(h.connectivity).toBe(1);
        expect(h.composite).toBeCloseTo(1, 5);
    });
    it("tanks to ~0 when everything is broken (gaps, no citations, orphans, fragmented)", () => {
        const a = page("a", "[[ghost]]", { title: "A" });
        const b = page("b", "", { title: "B" });
        const g = buildGraph([a, b], []);
        const h = scoreHealth({ pages: [a, b], graph: g, staleCount: 2 });
        expect(h.coverage).toBe(0);
        expect(h.citationDensity).toBe(0);
        expect(h.orphanRate).toBe(0);
        expect(h.connectivity).toBe(0);
        expect(h.freshness).toBe(0);
        expect(h.composite).toBeLessThan(0.05);
    });
    it("scores a partial wiki sensibly", () => {
        // chain a -> b -> c, only a has a source
        const a = page("a", "[[b]]", { title: "A", sources: ["s1"] });
        const b = page("b", "[[c]]", { title: "B" });
        const c = page("c", "", { title: "C" });
        const g = buildGraph([a, b, c], [{ id: "s1", path: "raw/sources/s1.md" }]);
        const h = scoreHealth({ pages: [a, b, c], graph: g, staleCount: 0 });
        expect(h.coverage).toBe(1); // b, c both resolve
        expect(h.citationDensity).toBeCloseTo(1 / 3, 2); // mean sources = (1+0+0)/3
        expect(h.orphanRate).toBe(1); // no orphans
        expect(h.connectivity).toBe(1); // single component
        expect(h.composite).toBeGreaterThan(0.75);
        expect(h.composite).toBeLessThan(0.85);
    });
});
//# sourceMappingURL=eval.test.js.map