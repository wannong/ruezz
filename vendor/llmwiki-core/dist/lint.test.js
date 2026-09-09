import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.js";
import { applyLintFixes, lintPages } from "./lint.js";
function mkFm(partial) {
    return {
        type: partial.type ?? "concept",
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
    const hasFm = Object.keys(fm).length > 0;
    return {
        id,
        path: `wiki/${id}.md`,
        fm: hasFm ? mkFm(fm) : null,
        body,
        raw: body,
    };
}
function ruleCodes(issues, pageId) {
    return issues.filter((i) => (pageId ? i.pageId === pageId : true)).map((i) => i.rule);
}
describe("lintPages — detection", () => {
    it("flags a page missing frontmatter", () => {
        const issues = lintPages([page("x", "body")], [], buildGraph([page("x", "body")], []));
        expect(ruleCodes(issues, "x")).toContain("missing-frontmatter");
    });
    it("flags a missing title", () => {
        const p = page("x", "body", { title: "" });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "x")).toContain("missing-title");
    });
    it("flags too-few-tags when fewer than 2 tags", () => {
        const p = page("x", "body", { title: "X", tags: ["only"] });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "x")).toContain("too-few-tags");
    });
    it("flags a broken wikilink to an unknown page", () => {
        const p = page("x", "see [[ghost]]", { title: "X" });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "x")).toContain("broken-wikilink");
    });
    it("flags a normalizable link (case mismatch) as autoFixable", () => {
        const foo = page("foo", "", { title: "Foo" });
        const bar = page("bar", "see [[Foo]]", { title: "Bar" });
        const issues = lintPages([foo, bar], [], buildGraph([foo, bar], []));
        const issue = issues.find((i) => i.rule === "link-normalizable" && i.pageId === "bar");
        expect(issue).toBeTruthy();
        expect(issue?.autoFixable).toBe(true);
        expect(issue?.fix?.kind).toBe("rewrite-wikilink");
    });
    it("flags a dangling source reference", () => {
        const p = page("x", "body", { title: "X", sources: ["missing/paper.pdf"] });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "x")).toContain("dangling-source");
    });
    it("flags an orphan page (degree 0, non-special)", () => {
        const lonely = page("lonely", "body", { title: "Lonely" });
        const issues = lintPages([lonely], [], buildGraph([lonely], []));
        expect(ruleCodes(issues, "lonely")).toContain("orphan");
    });
    it("does not flag special pages as orphans", () => {
        const overview = page("overview", "body", { title: "Overview", type: "overview" });
        const issues = lintPages([overview], [], buildGraph([overview], []));
        expect(ruleCodes(issues, "overview")).not.toContain("orphan");
    });
    it("stays quiet on a clean, well-linked page", () => {
        const a = page("a", "see [[b]]", { title: "A" });
        const b = page("b", "back to [[a]]", { title: "B" });
        const issues = lintPages([a, b], [], buildGraph([a, b], []));
        expect(issues).toEqual([]);
    });
    it("flags a footnote citation not materialized in sources[] (citation-graph-mismatch)", () => {
        const p = page("x", "Claim.[^1]\n\n[^1]: ml/paper.md, p. 4", { title: "X", sources: [] });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "x")).toContain("citation-graph-mismatch");
    });
    it("does not flag a footnote citation that is listed in sources[]", () => {
        const p = page("x", "Claim.[^1]\n\n[^1]: ml/paper.md, p. 4", { title: "X", sources: ["ml/paper.md"] });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "x")).not.toContain("citation-graph-mismatch");
    });
});
describe("lintPages — path conventions & duplicates", () => {
    it("flags duplicate pages sharing a basename", () => {
        const a = page("concepts/foo", "", { title: "Foo", type: "concept" });
        const b = page("system/foo", "", { title: "Foo2", type: "concept" });
        const issues = lintPages([a, b], [], buildGraph([a, b], []));
        expect(ruleCodes(issues, "concepts/foo")).toContain("duplicate-page");
        expect(ruleCodes(issues, "system/foo")).toContain("duplicate-page");
    });
    it("flags + auto-fixes a singular type dir (concept -> concepts)", () => {
        const p = page("concept/knowledge-compounding", "", { title: "KC", type: "concept" });
        const issues = lintPages([p], [], buildGraph([p], []));
        const issue = issues.find((i) => i.rule === "type-dir-mismatch");
        expect(issue?.autoFixable).toBe(true);
        expect(issue?.fix?.kind).toBe("move-page");
        expect(issue?.fix?.toPath).toBe("wiki/concepts/knowledge-compounding.md");
    });
    it("flags a non-canonical frontmatter type", () => {
        const p = page("system/foo", "body", { title: "Foo", type: "system" });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "system/foo")).toContain("non-canonical-type");
    });
    it("flags a reserved name used inside a subdir (log/log)", () => {
        const p = page("log/log", "", { title: "Log", type: "overview" });
        const issues = lintPages([p], [], buildGraph([p], []));
        expect(ruleCodes(issues, "log/log")).toContain("reserved-path");
    });
    it("does not flag a correctly-placed canonical page with the path rules", () => {
        const p = page("concepts/foo", "body", { title: "Foo", type: "concept" });
        const codes = ruleCodes(lintPages([p], [], buildGraph([p], [])), "concepts/foo");
        for (const r of ["type-dir-mismatch", "duplicate-page", "non-canonical-type", "reserved-path"]) {
            expect(codes).not.toContain(r);
        }
    });
});
describe("applyLintFixes", () => {
    it("rewrites a normalizable body wikilink to the canonical page id", () => {
        const foo = page("foo", "", { title: "Foo" });
        const bar = page("bar", "see [[Foo]] here", { title: "Bar" });
        const issues = lintPages([foo, bar], [], buildGraph([foo, bar], []));
        const fixed = applyLintFixes([foo, bar], issues);
        const fixedBar = fixed.find((p) => p.id === "bar");
        expect(fixedBar?.body).toBe("see [[foo]] here");
    });
    it("leaves non-autoFixable issues untouched", () => {
        const p = page("x", "see [[ghost]] here", { title: "X" });
        const issues = lintPages([p], [], buildGraph([p], []));
        const fixed = applyLintFixes([p], issues);
        expect(fixed[0]?.body).toBe("see [[ghost]] here");
    });
});
//# sourceMappingURL=lint.test.js.map