import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.js";
describe("parseFrontmatter", () => {
    it("returns null frontmatter when there is no fence", () => {
        const r = parseFrontmatter("just body text\n# heading");
        expect(r.frontmatter).toBeNull();
        expect(r.body).toBe("just body text\n# heading");
        expect(r.rawBlock).toBe("");
    });
    it("parses a strict top-of-file frontmatter block", () => {
        const content = "---\ntype: concept\ntitle: Hello\ntags: [a, b]\n---\n\nBody here.";
        const r = parseFrontmatter(content);
        expect(r.frontmatter).toEqual({ type: "concept", title: "Hello", tags: ["a", "b"] });
        expect(r.body).toBe("Body here.");
        // rawBlock + body always reconstructs the original (the trailing-newline
        // split between them is an internal detail of the greedy fence regex).
        expect(r.rawBlock + r.body).toBe(content);
    });
    it("stringifies numbers and booleans and empties null", () => {
        const r = parseFrontmatter("---\nyear: 2026\ndraft: true\nnote: null\n---\nbody");
        expect(r.frontmatter).toEqual({ year: "2026", draft: "true", note: "" });
    });
    it("repairs an invalid wikilink list into a quoted string array", () => {
        const r = parseFrontmatter("---\nrelated: [[foo]], [[bar-baz]]\n---\nbody");
        expect(r.frontmatter).toEqual({ related: ["[[foo]]", "[[bar-baz]]"] });
    });
    it("recovers frontmatter wrapped in a yaml code fence and strips the closing fence", () => {
        const content = "```yaml\n---\ntype: concept\n---\n```\n\n# Heading\nbody";
        const r = parseFrontmatter(content);
        expect(r.frontmatter).toEqual({ type: "concept" });
        expect(r.body.startsWith("```")).toBe(false);
        expect(r.body).toContain("# Heading");
    });
    it("recovers frontmatter pushed down by a couple of junk prefix lines", () => {
        const r = parseFrontmatter("junk line\n---\ntype: concept\n---\nbody");
        expect(r.frontmatter).toEqual({ type: "concept" });
    });
    it("does not mistake a deep horizontal rule for frontmatter", () => {
        // 7 prefix lines -> opening fence on line 8, beyond the 6-line window.
        const content = "a\nb\nc\nd\ne\nf\ng\n---\n\nhr section\n---\n";
        const r = parseFrontmatter(content);
        expect(r.frontmatter).toBeNull();
    });
    it("reconstructs the original content from rawBlock + body", () => {
        const content = "---\ntype: concept\n---\n\nbody";
        const r = parseFrontmatter(content);
        expect(r.rawBlock + r.body).toBe(content);
    });
    it("recovers fenceless leading YAML the model emitted without --- fences", () => {
        const content = [
            "type: concept",
            "title: Andrej Karpathy",
            "tags:",
            "  - ai",
            "  - ml",
            "created: 2024-01-01",
            "",
            "# Andrej Karpathy",
            "",
            "Body text.",
        ].join("\n");
        const r = parseFrontmatter(content);
        expect(r.frontmatter).toEqual({
            type: "concept",
            title: "Andrej Karpathy",
            tags: ["ai", "ml"],
            created: "2024-01-01",
        });
        expect(r.body).toContain("# Andrej Karpathy");
    });
    it("does not mistake prose-with-colons for fenceless frontmatter", () => {
        // no known frontmatter keys -> not recovered as YAML
        const content = "Summary: a note.\nNote: another line.\n\nA paragraph of body.";
        const r = parseFrontmatter(content);
        expect(r.frontmatter).toBeNull();
    });
});
//# sourceMappingURL=frontmatter.test.js.map