import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.js";
import { impactSurface } from "./staleness.js";
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
describe("impactSurface (backlinks that should go stale)", () => {
    it("returns the pages that link to or cite the target", () => {
        const a = page("a", "see [[b]]", { title: "A" });
        const b = page("b", "back", { title: "B" });
        const c = page("c", "cite", { title: "C", sources: ["b"] });
        // c cites source id "b" — add b as a source node so the edge is real
        const g = buildGraph([a, b, c], [{ id: "b", path: "raw/sources/b.md" }]);
        expect(impactSurface("b", g).sort()).toEqual(["a", "c"]);
    });
    it("returns an empty list for a page nothing references", () => {
        const a = page("a", "see [[b]]", { title: "A" });
        const b = page("b", "back", { title: "B" });
        const g = buildGraph([a, b], []);
        expect(impactSurface("a", g)).toEqual([]);
    });
    it("excludes dangling (non-node) sources and self-loops", () => {
        const a = page("a", "see [[ghost]] and [[a]]", { title: "A" });
        const g = buildGraph([a], []);
        expect(impactSurface("a", g)).toEqual([]);
    });
});
//# sourceMappingURL=staleness.test.js.map