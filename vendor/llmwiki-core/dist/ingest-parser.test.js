import { describe, expect, it } from "vitest";
import { parseIngestBlocks } from "./ingest-parser.js";
describe("parseIngestBlocks", () => {
    it("returns empty arrays for empty input", () => {
        expect(parseIngestBlocks("")).toEqual({ files: [], reviews: [] });
    });
    it("parses a single FILE block", () => {
        const text = [
            "---FILE: wiki/concepts/attention.md---",
            "---",
            "type: concept",
            "title: Attention",
            "---",
            "",
            "Body about attention.",
            "---END FILE---",
        ].join("\n");
        const r = parseIngestBlocks(text);
        expect(r.files).toHaveLength(1);
        expect(r.files[0]?.path).toBe("wiki/concepts/attention.md");
        expect(r.files[0]?.content).toContain("type: concept");
        expect(r.files[0]?.content).toContain("Body about attention.");
        expect(r.reviews).toEqual([]);
    });
    it("parses a single REVIEW block with type and title", () => {
        const text = [
            "---REVIEW: contradiction | Conflicting claims about X---",
            "Source A says up, source B says down.",
            "---END REVIEW---",
        ].join("\n");
        const r = parseIngestBlocks(text);
        expect(r.reviews).toHaveLength(1);
        expect(r.reviews[0]?.type).toBe("contradiction");
        expect(r.reviews[0]?.title).toBe("Conflicting claims about X");
        expect(r.reviews[0]?.content).toContain("Source A says up");
    });
    it("parses interleaved FILE and REVIEW blocks", () => {
        const text = [
            "---FILE: wiki/concepts/a.md---",
            "content A",
            "---END FILE---",
            "some prose between blocks is ignored",
            "---REVIEW: gap | Missing concept Z---",
            "Z is referenced but has no page.",
            "---END REVIEW---",
            "---FILE: wiki/entities/b.md---",
            "content B",
            "---END FILE---",
        ].join("\n");
        const r = parseIngestBlocks(text);
        expect(r.files.map((f) => f.path)).toEqual(["wiki/concepts/a.md", "wiki/entities/b.md"]);
        expect(r.reviews.map((rv) => rv.title)).toEqual(["Missing concept Z"]);
    });
    it("trims leading and trailing whitespace from block content", () => {
        const text = "---FILE: x.md---\n\n\n  trimmed body  \n\n---END FILE---";
        const r = parseIngestBlocks(text);
        expect(r.files[0]?.content).toBe("trimmed body");
    });
    it("tolerates spaces around FILE: and the fences", () => {
        const text = "--- FILE: x.md ---\nbody\n--- END FILE ---";
        const r = parseIngestBlocks(text);
        expect(r.files[0]?.path).toBe("x.md");
        expect(r.files[0]?.content).toBe("body");
    });
});
//# sourceMappingURL=ingest-parser.test.js.map