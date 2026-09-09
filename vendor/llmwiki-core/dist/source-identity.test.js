import { describe, expect, it } from "vitest";
import { sourceIdentityForPath, sourceReferenceIdentity, sourceSummarySlugFromIdentity, stableSlugHash, } from "./source-identity.js";
describe("stableSlugHash (FNV-1a 32-bit, base36)", () => {
    it("returns the FNV offset basis for the empty string", () => {
        // 0x811c9dc5 = 2166136261 -> base36 "ztntfp"
        expect(stableSlugHash("")).toBe("ztntfp");
    });
    it("is deterministic", () => {
        expect(stableSlugHash("ml/paper.pdf")).toBe(stableSlugHash("ml/paper.pdf"));
    });
    it("differs for different inputs", () => {
        expect(stableSlugHash("a")).not.toBe(stableSlugHash("b"));
    });
});
describe("sourceIdentityForPath", () => {
    it("strips a project-prefixed raw/sources path", () => {
        expect(sourceIdentityForPath("/proj", "/proj/raw/sources/ml/paper.pdf")).toBe("ml/paper.pdf");
    });
    it("strips a bare raw/sources prefix", () => {
        expect(sourceIdentityForPath("/proj", "raw/sources/x.md")).toBe("x.md");
    });
    it("strips after an embedded /raw/sources/ marker", () => {
        expect(sourceIdentityForPath("/proj", "foo/raw/sources/y.md")).toBe("y.md");
    });
    it("falls back to the file name when no marker is present", () => {
        expect(sourceIdentityForPath("/proj", "loose.pdf")).toBe("loose.pdf");
    });
    it("is case-insensitive when locating the marker but preserves case in the result", () => {
        expect(sourceIdentityForPath("/Proj", "/Proj/Raw/Sources/ML/Paper.PDF")).toBe("ML/Paper.PDF");
    });
});
describe("sourceReferenceIdentity", () => {
    it("strips a bare raw/sources prefix", () => {
        expect(sourceReferenceIdentity("raw/sources/a.md")).toBe("a.md");
    });
    it("strips after an embedded marker", () => {
        expect(sourceReferenceIdentity("x/raw/sources/b.md")).toBe("b.md");
    });
    it("passes through references with no marker", () => {
        expect(sourceReferenceIdentity("plain")).toBe("plain");
    });
});
describe("sourceSummarySlugFromIdentity", () => {
    it("returns the bare name (no extension) for a single-segment identity", () => {
        expect(sourceSummarySlugFromIdentity("notes.md")).toBe("notes");
    });
    it("returns 'source' for an empty identity", () => {
        expect(sourceSummarySlugFromIdentity("")).toBe("source");
    });
    it("composes a length-prefixed structural slug plus the stable hash for multi-segment identities", () => {
        const identity = "ml/transformers/attention.pdf";
        const result = sourceSummarySlugFromIdentity(identity);
        const expected = `2-ml--12-transformers--9-attention--${stableSlugHash(identity)}`;
        expect(result).toBe(expected);
    });
    it("truncates very long slugs to the cap while keeping the hash suffix", () => {
        const identity = `x/${"a".repeat(200)}.md`;
        const result = sourceSummarySlugFromIdentity(identity);
        expect(result.length).toBeLessThanOrEqual(120);
        expect(result.endsWith(`--${stableSlugHash(identity)}`)).toBe(true);
        expect(result.startsWith("1-x--200-")).toBe(true);
    });
});
//# sourceMappingURL=source-identity.test.js.map