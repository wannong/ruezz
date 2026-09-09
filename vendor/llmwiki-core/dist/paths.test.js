import { describe, expect, it } from "vitest";
import { getFileName, normalizePath } from "./paths.js";
describe("normalizePath", () => {
    it("converts backslashes to forward slashes", () => {
        expect(normalizePath("a\\b\\c")).toBe("a/b/c");
    });
    it("collapses repeated slashes", () => {
        expect(normalizePath("a//b///c")).toBe("a/b/c");
    });
    it("strips a trailing slash but keeps a lone root slash", () => {
        expect(normalizePath("a/b/")).toBe("a/b");
        expect(normalizePath("/")).toBe("/");
    });
    it("trims surrounding whitespace", () => {
        expect(normalizePath("  a/b  ")).toBe("a/b");
    });
    it("preserves case", () => {
        expect(normalizePath("Raw/Sources/Foo.PDF")).toBe("Raw/Sources/Foo.PDF");
    });
});
describe("getFileName", () => {
    it("returns the last path segment", () => {
        expect(getFileName("a/b/c.md")).toBe("c.md");
    });
    it("returns the input when there is no separator", () => {
        expect(getFileName("c.md")).toBe("c.md");
    });
});
//# sourceMappingURL=paths.test.js.map