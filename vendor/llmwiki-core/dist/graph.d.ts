import type { Graph, Page, SourceRef } from "./types.js";
/**
 * Normalize a link target to a bare page id: strip a leading `wiki/` (models
 * naturally write `[[wiki/concepts/foo]]`, the on-disk path) and a trailing
 * `.md`. This is the "path-mode" convention that keeps links resolving.
 */
export declare function normalizeLinkTarget(target: string): string;
/** Extract deduplicated, normalized wikilink targets from markdown body. */
export declare function extractWikilinks(body: string): string[];
/**
 * Build an Obsidian-style fuzzy link resolver over a set of pages. A target
 * resolves (in priority order) by: exact id, normalized id (lowercase, no
 * wiki/+.md), basename (case-insensitive), or title (case-insensitive). Returns
 * the canonical page id, or undefined if nothing matches. This is what lets a
 * bare `[[LLM Wiki]]` or `[[llmwiki-overview]]` connect to the right page
 * regardless of which type-folder it lives in.
 */
export declare function createPageResolver(pages: Page[]): (target: string) => string | undefined;
export declare function buildGraph(pages: Page[], sources: SourceRef[]): Graph;
//# sourceMappingURL=graph.d.ts.map