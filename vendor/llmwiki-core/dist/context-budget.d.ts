/**
 * Pure budget allocator for assembling the LLM context window.
 *
 * Given an LLM's `maxContextSize` (in characters), compute the per-section
 * character budgets used when packing the prompt.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │              maxCtx (100%)                          │
 *   ├──────┬───────────────┬──────────────────┬───────────┤
 *   │ idx  │   pages       │  history + sys   │  resp     │
 *   │  5%  │    50%        │    ~30%          │   15%     │
 *   └──────┴───────────────┴──────────────────┴───────────┤
 *
 * The response reserve is a "passive" reservation: we refuse to fill above
 * (maxCtx - responseReserve) so the LLM has room to answer.
 */
/** Result of `computeContextBudget`. All values are character counts. */
export interface ContextBudget {
    /** The model's full context window (falls back to a default when caller passes 0/undefined). */
    maxCtx: number;
    /** Characters left empty so the LLM has room to write its response. */
    responseReserve: number;
    /** Wiki index summary budget (~5%). */
    indexBudget: number;
    /** Total characters available for retrieved wiki page content (50%). */
    pageBudget: number;
    /** Per-page truncation cap. Scales with pageBudget (floor 5K), capped at pageBudget. */
    maxPageSize: number;
}
/**
 * Compute character budgets from the LLM's max context window.
 *
 * Falsy `maxContextSize` (0 / NaN / undefined) falls back to the default
 * (~200K chars) so existing configs don't break.
 */
export declare function computeContextBudget(maxContextSize: number | undefined): ContextBudget;
//# sourceMappingURL=context-budget.d.ts.map