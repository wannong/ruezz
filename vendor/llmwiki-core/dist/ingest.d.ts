/**
 * Two-step chain-of-thought ingest prompt builders (pure).
 *
 * Stage 1 — analysis: the model reasons over the source (+ purpose + existing
 * index) and returns structured analysis, WITHOUT emitting pages. Stage 2 —
 * generation: the analysis is fed back and the model emits FILE/REVIEW blocks.
 *
 * Splitting "understand" from "write" into two calls materially improves page
 * quality. The subject-boundary rule guards against a classic LLM failure: the
 * model transfers claims/limits/evaluations between entities that merely share
 * keywords.
 */
export interface IngestSource {
    title: string;
    content: string;
    url?: string;
}
export interface IngestContext {
    /** The wiki's directional intent (purpose.md). */
    purpose?: string;
    /** A compact catalog of existing pages (index.md). */
    index?: string;
    /** Optional structural conventions hint (schema.md summary). */
    schemaHint?: string;
}
/** Build the stage-1 analysis prompt (the user message body). */
export declare function buildAnalysisPrompt(source: IngestSource, ctx: IngestContext): string;
/** Build the stage-2 generation prompt (the user message body). */
export declare function buildGenerationPrompt(source: IngestSource, analysis: string, ctx: IngestContext): string;
//# sourceMappingURL=ingest.d.ts.map