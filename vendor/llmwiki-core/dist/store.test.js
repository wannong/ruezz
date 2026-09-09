import { afterEach, describe, expect, it } from "vitest";
import { Store } from "./store.js";
let stores = [];
function openStore() {
    const s = new Store(":memory:");
    stores.push(s);
    return s;
}
afterEach(() => {
    for (const s of stores)
        s.close();
    stores = [];
});
const entry = (id, content, title = id) => ({
    id,
    path: `wiki/${id}.md`,
    sourceKind: "wiki",
    title,
    content,
});
describe("Store (SQLite + FTS5)", () => {
    it("finds a page containing the search term", () => {
        const s = openStore();
        s.rebuild([entry("a", "The transformer architecture for attention."), entry("b", "A note about cats.")]);
        const hits = s.search("transformer");
        expect(hits.map((h) => h.pageId)).toContain("a");
        expect(hits.map((h) => h.pageId)).not.toContain("b");
    });
    it("returns no hits for a term that appears nowhere", () => {
        const s = openStore();
        s.rebuild([entry("a", "hello world")]);
        expect(s.search("zzzzz")).toEqual([]);
    });
    it("ranks a denser match ahead of a sparse one", () => {
        const s = openStore();
        s.rebuild([
            entry("dense", "attention attention attention transformer"),
            entry("sparse", "attention once"),
        ]);
        const hits = s.search("attention");
        expect(hits.length).toBe(2);
        expect(hits[0]?.pageId).toBe("dense");
    });
    it("matches a CJK substring via the trigram tokenizer", () => {
        const s = openStore();
        s.rebuild([entry("c", "注意力机制是 Transformer 的核心")]);
        const hits = s.search("注意力");
        expect(hits.map((h) => h.pageId)).toContain("c");
    });
    it("adds a page via upsert and makes it searchable", () => {
        const s = openStore();
        s.upsert(entry("a", "initial"));
        s.upsert(entry("b", "brand new content about diffusion"));
        expect(s.search("diffusion").map((h) => h.pageId)).toContain("b");
    });
    it("removes a page from search after delete", () => {
        const s = openStore();
        s.rebuild([entry("a", "diffusion models")]);
        s.delete("a");
        expect(s.search("diffusion")).toEqual([]);
    });
    it("tracks staleness with markStale / clearStale / findStale", () => {
        const s = openStore();
        s.rebuild([entry("a", "x"), entry("b", "y")]);
        s.markStale("a");
        expect(s.findStale().map((r) => r.id).sort()).toEqual(["a"]);
        s.clearStale("a");
        expect(s.findStale()).toEqual([]);
    });
    it("rebuild is idempotent — search results are stable across rebuilds", () => {
        const s = openStore();
        const entries = [entry("a", "attention transformer"), entry("b", "diffusion models")];
        s.rebuild(entries);
        const first = s.search("attention").map((h) => h.pageId);
        s.rebuild(entries);
        const second = s.search("attention").map((h) => h.pageId);
        expect(second).toEqual(first);
    });
    it("uses OR semantics for multi-term queries so natural-language questions still match", () => {
        const s = openStore();
        s.rebuild([entry("a", "the llm wiki versus rag pipelines"), entry("b", "totally unrelated note about cats")]);
        // a natural-language query whose stop words ("what", "is", "the") aren't all in the page
        const hits = s.search("what is the difference between llm and rag");
        expect(hits.map((h) => h.pageId)).toContain("a");
        expect(hits.map((h) => h.pageId)).not.toContain("b");
    });
});
//# sourceMappingURL=store.test.js.map