import type { Graph, Page, SourceRef } from "./types.js";
/**
 * Two-tier linter.
 *
 * Tier 1 (mechanical, deterministic) is computed here over parsed pages + the
 * derived graph: missing frontmatter/title, too-few-tags, broken/normalizable
 * wikilinks, dangling sources, orphans. Normalizable links carry an autoFixable
 * `rewrite-wikilink` patch that {@link applyLintFixes} applies deterministically.
 *
 * Tier 2 (semantic judgments — contradictions, stale claims, suggestions) is
 * LLM-driven and added later via a `semantic-lint` module.
 */
export type LintSeverity = "error" | "warn" | "info";
export type LintFix = {
    kind: "rewrite-wikilink";
    oldTarget: string;
    newTarget: string;
} | {
    kind: "move-page";
    fromPath: string;
    toPath: string;
};
export interface LintIssue {
    pageId: string;
    severity: LintSeverity;
    rule: string;
    message: string;
    autoFixable: boolean;
    fix?: LintFix;
}
/** Extract source references from footnote definitions (`[^id]: <ref>, p. N`). */
export declare function extractFootnoteCitations(body: string): string[];
export declare function lintPages(pages: Page[], sources: SourceRef[], graph: Graph): LintIssue[];
/** Apply Tier-1 auto-fixable patches: rewrite normalizable wikilinks + relocate misplaced pages. */
export declare function applyLintFixes(pages: Page[], issues: LintIssue[]): Page[];
//# sourceMappingURL=lint.d.ts.map