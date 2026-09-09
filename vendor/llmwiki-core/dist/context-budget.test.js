import { describe, expect, it } from "vitest";
import { computeContextBudget } from "./context-budget.js";
describe("computeContextBudget", () => {
    it("falls back to the default context window when given a falsy size", () => {
        const b = computeContextBudget(undefined);
        expect(b.maxCtx).toBe(204_800);
    });
    it("falls back to the default when given 0", () => {
        expect(computeContextBudget(0).maxCtx).toBe(204_800);
    });
    it("falls back to the default when given NaN", () => {
        expect(computeContextBudget(Number.NaN).maxCtx).toBe(204_800);
    });
    it("allocates the canonical fractions for the default window", () => {
        const b = computeContextBudget(204_800);
        // 15% response reserve, 5% index, 50% pages
        expect(b.responseReserve).toBe(30_720);
        expect(b.indexBudget).toBe(10_240);
        expect(b.pageBudget).toBe(102_400);
    });
    it("scales the per-page cap to 30% of page budget when that exceeds the 5k floor", () => {
        const b = computeContextBudget(204_800);
        // floor(102_400 * 0.30) = 30_720, above the 5k floor, below pageBudget
        expect(b.maxPageSize).toBe(30_720);
    });
    it("scales budgets for an explicit context size", () => {
        const b = computeContextBudget(100_000);
        expect(b.maxCtx).toBe(100_000);
        expect(b.responseReserve).toBe(15_000);
        expect(b.indexBudget).toBe(5_000);
        expect(b.pageBudget).toBe(50_000);
        expect(b.maxPageSize).toBe(15_000); // 30% of 50k, above floor
    });
    it("enforces the 5k per-page floor for a small window", () => {
        // pageBudget = 20_000 -> 30% = 6_000 which is above the 5k floor
        const b = computeContextBudget(40_000);
        expect(b.pageBudget).toBe(20_000);
        expect(b.maxPageSize).toBe(6_000);
    });
    it("caps the per-page floor at pageBudget for tiny windows so one page cannot exceed the whole page budget", () => {
        // pageBudget = 4_000 (< 5k floor) -> maxPageSize must be capped to 4_000, not 5_000
        const b = computeContextBudget(8_000);
        expect(b.pageBudget).toBe(4_000);
        expect(b.maxPageSize).toBe(4_000);
    });
});
//# sourceMappingURL=context-budget.test.js.map