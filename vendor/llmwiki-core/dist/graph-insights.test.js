import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.js";
import { connectedComponents, findHubs, findKnowledgeGaps } from "./graph-insights.js";
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
describe("findKnowledgeGaps", () => {
    it("aggregates dangling link targets into proposed-page candidates", () => {
        const a = page("a", "see [[ghost]]", { title: "A" });
        const b = page("b", "also [[ghost]]", { title: "B" });
        const g = buildGraph([a, b], []);
        const gaps = findKnowledgeGaps(g);
        expect(gaps).toHaveLength(1);
        expect(gaps[0]?.target).toBe("ghost");
        expect(gaps[0]?.referencedBy.sort()).toEqual(["a", "b"]);
    });
    it("returns nothing when every link resolves", () => {
        const a = page("a", "see [[b]]", { title: "A" });
        const b = page("b", "back", { title: "B" });
        expect(findKnowledgeGaps(buildGraph([a, b], []))).toEqual([]);
    });
});
describe("findHubs", () => {
    it("returns nodes at or above the degree threshold", () => {
        // hub is linked by a, b, c
        const hub = page("hub", "", { title: "Hub" });
        const a = page("a", "[[hub]]", { title: "A" });
        const b = page("b", "[[hub]]", { title: "B" });
        const c = page("c", "[[hub]]", { title: "C" });
        const g = buildGraph([hub, a, b, c], []);
        const hubs = findHubs(g, 3);
        expect(hubs.map((h) => h.id)).toContain("hub");
        expect(hubs.map((h) => h.id)).not.toContain("a");
    });
});
describe("connectedComponents", () => {
    it("groups connected pages and isolates disconnected ones", () => {
        // chain a-b-c, pair d-e, lonely f
        const a = page("a", "[[b]]", { title: "A" });
        const b = page("b", "[[c]]", { title: "B" });
        const c = page("c", "", { title: "C" });
        const d = page("d", "[[e]]", { title: "D" });
        const e = page("e", "", { title: "E" });
        const f = page("f", "", { title: "F" });
        const comps = connectedComponents(buildGraph([a, b, c, d, e, f], []))
            .map((comp) => comp.sort())
            .sort((x, y) => x[0].localeCompare(y[0]));
        expect(comps).toEqual([["a", "b", "c"], ["d", "e"], ["f"]]);
    });
});
//# sourceMappingURL=graph-insights.test.js.map