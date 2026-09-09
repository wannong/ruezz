import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer.js";
describe("tokenize", () => {
    it("splits ASCII text into lowercase word tokens on non-alphanumerics", () => {
        expect(tokenize("Hello World")).toEqual(["hello", "world"]);
    });
    it("splits on hyphens and punctuation", () => {
        expect(tokenize("machine-learning, RLHF!")).toEqual(["machine", "learning", "rlhf"]);
    });
    it("keeps digit runs together", () => {
        expect(tokenize("GPT-4 and 2026")).toEqual(["gpt", "4", "and", "2026"]);
    });
    it("emits each CJK ideograph as its own single-character token", () => {
        expect(tokenize("注意力机制")).toEqual(["注", "意", "力", "机", "制"]);
    });
    it("mixes ASCII words and CJK single chars", () => {
        expect(tokenize("Transformer 注意力")).toEqual(["transformer", "注", "意", "力"]);
    });
    it("normalizes fullwidth characters via NFKC before tokenizing", () => {
        // fullwidth ＡＢ１２ -> AB12 -> ab12
        expect(tokenize("ＡＢ１２")).toEqual(["ab12"]);
    });
    it("returns an empty array for punctuation-only or empty input", () => {
        expect(tokenize("")).toEqual([]);
        expect(tokenize("!!! ... ---")).toEqual([]);
    });
});
//# sourceMappingURL=tokenizer.test.js.map