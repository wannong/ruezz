import type { Graph } from "./types.js";
/**
 * Staleness / impact propagation (pure).
 *
 * When a page changes, every page that links to or cites it may now be stale.
 * {@link impactSurface} returns exactly that backlink set — the signal the
 * maintenance loop consumes. The actual `stale_since` mutation happens in the
 * store; this module only computes *what* should be marked.
 */
/** Pages that reference `targetId` via a `links_to` or `cites` edge (real nodes only). */
export declare function backlinkPageIds(targetId: string, graph: Graph): string[];
/** Alias: the set of pages that should go stale when `targetId` changes. */
export declare function impactSurface(targetId: string, graph: Graph): string[];
//# sourceMappingURL=staleness.d.ts.map