import { describe, expect, it } from "vitest";
import { planMaintenance } from "./maintain.js";
const issue = (rule, pageId) => ({
    pageId,
    severity: "warn",
    rule,
    message: `${rule} on ${pageId}`,
    autoFixable: false,
});
describe("planMaintenance", () => {
    it("turns staleness, gaps, and lint issues into a prioritized task list", () => {
        const plan = planMaintenance({
            stalePageIds: ["a", "b"],
            gaps: [{ target: "missing", referencedBy: ["a", "b"] }],
            lintIssues: [issue("orphan", "c"), issue("broken-wikilink", "a")],
        });
        const kinds = plan.tasks.map((t) => t.kind);
        expect(kinds).toContain("resynthesize");
        expect(kinds).toContain("propose");
        expect(kinds).toContain("review");
        expect(plan.counts.resynthesize).toBe(2);
        expect(plan.counts.propose).toBe(1);
        expect(plan.counts.review).toBe(2);
    });
    it("caps the number of proposed pages", () => {
        const gaps = Array.from({ length: 10 }, (_, i) => ({ target: `g${i}`, referencedBy: ["a"] }));
        const plan = planMaintenance({ stalePageIds: [], gaps, lintIssues: [], maxPropose: 3 });
        expect(plan.counts.propose).toBe(3);
    });
    it("produces an empty plan when there is nothing to do", () => {
        const plan = planMaintenance({ stalePageIds: [], gaps: [], lintIssues: [] });
        expect(plan.tasks).toEqual([]);
        expect(plan.counts).toEqual({ resynthesize: 0, propose: 0, review: 0 });
    });
    it("skips auto-fixable lint issues (those are not maintenance work)", () => {
        const auto = { ...issue("link-normalizable", "a"), autoFixable: true };
        const plan = planMaintenance({ stalePageIds: [], gaps: [], lintIssues: [auto] });
        expect(plan.counts.review).toBe(0);
    });
});
//# sourceMappingURL=maintain.test.js.map