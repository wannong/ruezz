import type { LintIssue } from "./lint.js";
import type { KnowledgeGap } from "./graph-insights.js";
/**
 * Owned autonomy/maintenance loop (differentiator A). Unlike the reference
 * projects (which outsource maintenance to an external scheduled routine), the
 * engine itself plans and runs maintenance from its own signals: staleness,
 * knowledge gaps, and open lint issues.
 *
 * `planMaintenance` is pure (signal -> prioritized task list). The execution
 * (`Wiki.maintain`) uses an injected LLM to fill gaps and refresh stale pages.
 */
export interface MaintenanceTask {
    kind: "resynthesize" | "propose" | "review";
    pageId?: string;
    target?: string;
    detail: string;
}
export interface MaintenancePlan {
    tasks: MaintenanceTask[];
    counts: {
        resynthesize: number;
        propose: number;
        review: number;
    };
}
export declare function planMaintenance(input: {
    stalePageIds: string[];
    gaps: KnowledgeGap[];
    lintIssues: LintIssue[];
    maxPropose?: number;
}): MaintenancePlan;
/** Prompt the model to draft a stub page for a missing concept (a knowledge gap). */
export declare function buildProposePrompt(gap: KnowledgeGap, neighborSnippets: string): string;
/** Prompt the model to refresh a stale page from its sources. */
export declare function buildRefreshPrompt(pageId: string, currentBody: string, sourceSnippets: string): string;
//# sourceMappingURL=maintain.d.ts.map