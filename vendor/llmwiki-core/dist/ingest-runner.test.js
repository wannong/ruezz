import { describe, expect, it } from "vitest";
import { runIngest } from "./ingest-runner.js";
import { MockLlm } from "./llm-client.js";
const source = { title: "Test Source", content: "Some content about attention." };
const ctx = { purpose: "Research transformers." };
describe("runIngest", () => {
    it("runs the two-step pipeline and returns parsed FILE/REVIEW blocks", async () => {
        const llm = new MockLlm([
            "Stage-1 analysis: the key concept is attention.",
            [
                "---FILE: wiki/concepts/attention.md---",
                "type: concept",
                "title: Attention",
                "---",
                "Attention is all you need.",
                "---END FILE---",
                "---REVIEW: gap | Missing context window data---",
                "Context lengths are not discussed.",
                "---END REVIEW---",
            ].join("\n"),
        ]);
        const blocks = await runIngest(source, ctx, llm);
        expect(blocks.files).toHaveLength(1);
        expect(blocks.files[0]?.path).toBe("wiki/concepts/attention.md");
        expect(blocks.files[0]?.content).toContain("Attention is all you need.");
        expect(blocks.reviews).toHaveLength(1);
        expect(blocks.reviews[0]?.type).toBe("gap");
    });
    it("returns empty blocks when the model emits no structured output", async () => {
        const llm = new MockLlm(["analysis", "just prose, no blocks"]);
        const blocks = await runIngest(source, ctx, llm);
        expect(blocks.files).toEqual([]);
        expect(blocks.reviews).toEqual([]);
    });
});
//# sourceMappingURL=ingest-runner.test.js.map