import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt, buildGenerationPrompt } from "./ingest.js";
const source = { title: "Attention Is All You Need", content: "We propose a new architecture..." };
const ctx = { purpose: "Understand transformer architectures.", index: "- [[transformers]]" };
describe("buildAnalysisPrompt", () => {
    it("includes the source title and content", () => {
        const p = buildAnalysisPrompt(source, ctx);
        expect(p).toContain("Attention Is All You Need");
        expect(p).toContain("We propose a new architecture");
    });
    it("injects purpose and existing index for grounding", () => {
        const p = buildAnalysisPrompt(source, ctx);
        expect(p).toContain("Understand transformer architectures.");
        expect(p).toContain("[[transformers]]");
    });
    it("states the subject-boundary anti-cross-contamination rule", () => {
        const p = buildAnalysisPrompt(source, ctx);
        expect(p.toLowerCase()).toContain("do not transfer");
    });
});
describe("buildGenerationPrompt", () => {
    it("documents the FILE and REVIEW block format", () => {
        const p = buildGenerationPrompt(source, "analysis json here", ctx);
        expect(p).toContain("---FILE:");
        expect(p).toContain("---END FILE---");
        expect(p).toContain("---REVIEW:");
        expect(p).toContain("---END REVIEW---");
    });
    it("forbids restating the stage-1 analysis", () => {
        const p = buildGenerationPrompt(source, "analysis json here", ctx);
        expect(p.toLowerCase()).toContain("do not restate");
    });
});
//# sourceMappingURL=ingest.test.js.map