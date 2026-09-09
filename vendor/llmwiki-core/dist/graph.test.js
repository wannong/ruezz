import { describe, expect, it } from "vitest";
import { buildGraph, extractWikilinks } from "./graph.js";
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
    return { id, path: `wiki/${id}.md`, fm: fm.title || fm.related?.length || fm.sources?.length ? mkFm(fm) : null, body, raw: body };
}
describe("extractWikilinks", () => {
    it("extracts bare wikilink targets", () => {
        expect(extractWikilinks("see [[foo]] and [[bar-baz]]")).toEqual(["foo", "bar-baz"]);
    });
    it("strips a trailing alias and .md extension", () => {
        expect(extractWikilinks("[[concepts/attention.md|Attention]]")).toEqual(["concepts/attention"]);
    });
    it("normalizes a wiki/-prefixed path to the bare page id", () => {
        // models naturally write [[wiki/concepts/foo]] (the on-disk path); page ids drop wiki/
        expect(extractWikilinks("see [[wiki/concepts/foo]] and [[wiki/operations/bar.md]]")).toEqual([
            "concepts/foo",
            "operations/bar",
        ]);
    });
    it("returns an empty array when there are no wikilinks", () => {
        expect(extractWikilinks("plain text, no links")).toEqual([]);
    });
    it("deduplicates while preserving order", () => {
        expect(extractWikilinks("[[foo]] again [[foo]] and [[bar]]")).toEqual(["foo", "bar"]);
    });
});
describe("buildGraph", () => {
    it("creates a links_to edge from a body wikilink and sets both degrees", () => {
        const g = buildGraph([page("a", "see [[b]]"), page("b")], []);
        const edge = g.edges.find((e) => e.source === "a" && e.target === "b");
        expect(edge?.relation).toBe("links_to");
        expect(g.nodes.get("a")?.degree).toBe(1);
        expect(g.nodes.get("b")?.degree).toBe(1);
    });
    it("creates a links_to edge from related frontmatter", () => {
        const g = buildGraph([page("a", "", { related: ["b"] }), page("b")], []);
        expect(g.edges.some((e) => e.source === "a" && e.target === "b" && e.relation === "links_to")).toBe(true);
    });
    it("normalizes wiki/-prefixed related entries to bare page ids", () => {
        const g = buildGraph([page("a", "", { related: ["wiki/concepts/foo.md"] }), page("concepts/foo", "", { title: "Foo" })], []);
        expect(g.edges.some((e) => e.source === "a" && e.target === "concepts/foo")).toBe(true);
        expect(g.nodes.get("concepts/foo")?.degree).toBeGreaterThan(0);
    });
    it("resolves a bare-title wikilink to a page by basename (Obsidian-style fuzzy match)", () => {
        const foo = page("concepts/LLM Wiki", "", { title: "LLM Wiki" });
        const ref = page("a", "see [[LLM Wiki]]", { title: "A" });
        const g = buildGraph([foo, ref], []);
        expect(g.edges.some((e) => e.source === "a" && e.target === "concepts/LLM Wiki")).toBe(true);
        expect(g.nodes.get("concepts/LLM Wiki")?.degree).toBeGreaterThan(0);
    });
    it("resolves a bare-slug wikilink to a page whose basename matches", () => {
        const sys = page("system/llmwiki-overview", "", { title: "Overview" });
        const ref = page("a", "see [[llmwiki-overview]]", { title: "A" });
        const g = buildGraph([sys, ref], []);
        expect(g.edges.some((e) => e.target === "system/llmwiki-overview")).toBe(true);
    });
    it("resolves a wikilink that uses a page's title (not its slug)", () => {
        const kc = page("concepts/knowledge-compounding", "", { title: "Knowledge Compounding" });
        const ref = page("a", "see [[Knowledge Compounding]]", { title: "A" });
        const g = buildGraph([kc, ref], []);
        expect(g.edges.some((e) => e.target === "concepts/knowledge-compounding")).toBe(true);
    });
    it("resolves a link by slug-normalized form (Claude.ai -> claudeai, spaces/punct collapse)", () => {
        const a = page("concepts/claudeai", "", { title: "Claude AI" });
        const b = page("concepts/mcp-model-context-protocol", "", { title: "MCP" });
        const ref = page("x", "uses [[Claude.ai]] and [[MCP (Model Context Protocol)]]", { title: "X" });
        const g = buildGraph([a, b, ref], []);
        expect(g.edges.some((e) => e.target === "concepts/claudeai")).toBe(true);
        expect(g.edges.some((e) => e.target === "concepts/mcp-model-context-protocol")).toBe(true);
    });
    it("creates a cites edge from sources frontmatter and carries confidence", () => {
        const src = { id: "ml/paper.pdf", path: "raw/sources/ml/paper.pdf", title: "Paper" };
        const g = buildGraph([page("a", "", { sources: ["ml/paper.pdf"], confidence: "EXTRACTED" })], [src]);
        const edge = g.edges.find((e) => e.source === "a" && e.relation === "cites");
        expect(edge?.target).toBe("ml/paper.pdf");
        expect(edge?.confidence).toBe("EXTRACTED");
        expect(g.nodes.get("ml/paper.pdf")?.type).toBe("source");
    });
    it("marks a page with no real connections as degree 0 (orphan)", () => {
        const g = buildGraph([page("lonely")], []);
        expect(g.nodes.get("lonely")?.degree).toBe(0);
    });
    it("deduplicates edges when a target is linked both in related and body", () => {
        const g = buildGraph([page("a", "[[b]]", { related: ["b"] }), page("b")], []);
        const ab = g.edges.filter((e) => e.source === "a" && e.target === "b" && e.relation === "links_to");
        expect(ab.length).toBe(1);
    });
    it("records a dangling link as an edge but does not inflate the source's real degree", () => {
        const g = buildGraph([page("a", "[[ghost]]")], []);
        expect(g.edges.some((e) => e.source === "a" && e.target === "ghost")).toBe(true);
        expect(g.nodes.get("a")?.degree).toBe(0);
        expect(g.nodes.has("ghost")).toBe(false);
    });
    it("bumps dataVersion on each rebuild", () => {
        const pages = [page("a", "[[b]]"), page("b")];
        const g1 = buildGraph(pages, []);
        const g2 = buildGraph(pages, []);
        expect(g2.dataVersion).toBeGreaterThan(g1.dataVersion);
    });
});
//# sourceMappingURL=graph.test.js.map