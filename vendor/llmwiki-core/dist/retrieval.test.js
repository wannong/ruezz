import { afterEach, describe, expect, it } from "vitest";
import { buildGraph } from "./graph.js";
import { computeContextBudget } from "./context-budget.js";
import { Store } from "./store.js";
import { retrieve } from "./retrieval.js";
let stores = [];
const open = () => {
    const s = new Store(":memory:");
    stores.push(s);
    return s;
};
afterEach(() => {
    for (const s of stores)
        s.close();
    stores = [];
});
function page(id, body, related = []) {
    const fm = {
        type: "concept",
        title: id,
        tags: ["a", "b"],
        related,
        sources: [],
        created: "2026-01-01",
        updated: "2026-01-01",
    };
    return { id, path: `wiki/${id}.md`, fm, body, raw: body };
}
const entry = (p) => ({ id: p.id, path: p.path, sourceKind: "wiki", title: p.id, content: p.body });
describe("retrieve (BM25 + graph expansion)", () => {
    it("seeds from BM25 and expands to graph neighbors", async () => {
        const attention = page("concepts/attention", "attention is the key mechanism");
        const transformers = page("concepts/transformers", "transformer architecture", ["concepts/attention"]);
        const cats = page("concepts/cats", "a note about cats and dogs");
        const pages = [attention, transformers, cats];
        const store = open();
        store.rebuild(pages.map(entry));
        const graph = buildGraph(pages, []);
        const res = await retrieve({
            query: "attention",
            store,
            graph,
            pages,
            budget: computeContextBudget(204_800),
        });
        const ids = res.hits.map((h) => h.pageId);
        expect(ids).toContain("concepts/attention"); // seed
        expect(ids).toContain("concepts/transformers"); // expanded neighbor
        expect(ids).not.toContain("concepts/cats"); // irrelevant, no link
    });
    it("packs a context block with the retrieved page bodies", async () => {
        const attention = page("concepts/attention", "attention body text here");
        const transformers = page("concepts/transformers", "transformer body text here", ["concepts/attention"]);
        const pages = [attention, transformers];
        const store = open();
        store.rebuild(pages.map(entry));
        const res = await retrieve({
            query: "attention",
            store,
            graph: buildGraph(pages, []),
            pages,
            budget: computeContextBudget(204_800),
        });
        expect(res.contextBlock).toContain("attention body text here");
        expect(res.contextBlock).toContain("[[concepts/attention]]");
        expect(res.contextBlock).toContain("[[concepts/transformers]]");
    });
    it("respects the page budget when packing", async () => {
        const big = "x".repeat(20_000);
        const a = page("a", big);
        const b = page("b", big);
        const pages = [a, b];
        const store = open();
        store.rebuild(pages.map(entry));
        const res = await retrieve({
            query: "xxxx",
            store,
            graph: buildGraph(pages, []),
            pages,
            budget: computeContextBudget(10_000), // tiny budget
        });
        // pageBudget = 5000; each page truncated; total stays within budget
        expect(res.contextBlock.length).toBeLessThanOrEqual(6_000);
    });
});
//# sourceMappingURL=retrieval.test.js.map