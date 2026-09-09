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
/** Build the stage-1 analysis prompt (the user message body). */
export function buildAnalysisPrompt(source, ctx) {
    return [
        `You are maintaining a persistent, interlinked markdown knowledge base (an "LLM Wiki").`,
        `Read the source below and produce a structured analysis. Do NOT write wiki pages yet.`,
        ``,
        `## Purpose of this wiki`,
        ctx.purpose?.trim() || "(no explicit purpose — infer scope from the source).",
        ``,
        `## Existing pages`,
        ctx.index?.trim() || "(empty wiki — this is the first source).",
        ``,
        `## Source: ${source.title}${source.url ? `\nURL: ${source.url}` : ""}`,
        "```",
        source.content,
        "```",
        ``,
        `Extract: the key entities, concepts, and claims; how they connect to existing pages;`,
        `any contradictions with what's already known; and recommended new/updated pages.`,
        ``,
        `CRITICAL — subject boundary: do not transfer claims, limits, or evaluations from one`,
        `entity/method/product to another just because they share keywords. Attribute every`,
        `claim to this source only.`,
        ``,
        `Return concise structured analysis (entities, concepts, claims, connections,`,
        `contradictions, recommendations).`,
    ].join("\n");
}
/** Build the stage-2 generation prompt (the user message body). */
export function buildGenerationPrompt(source, analysis, ctx) {
    return [
        `Using the analysis below, write the wiki pages this source should produce or update.`,
        `Do NOT restate or echo the analysis — that was stage 1's job; only emit the pages.`,
        ``,
        `## Purpose of this wiki`,
        ctx.purpose?.trim() || "(no explicit purpose).",
        ``,
        `## Source: ${source.title}`,
        ``,
        `## Stage-1 analysis`,
        analysis,
        ``,
        `## Output format (emit ONLY these blocks)`,
        `For each page:`,
        `---FILE: wiki/<type>/<slug>.md---`,
        `<YAML frontmatter with: type, title, tags (>=2), related ([[]] slugs), sources (stable`,
        `source ids), created, updated, confidence (EXTRACTED|INFERRED|AMBIGUOUS|UNVERIFIED)>`,
        `<markdown body with [[wikilinks]] and footnote citations>`,
        `---END FILE---`,
        ``,
        `## Path conventions (IMPORTANT)`,
        `- type directory must match the frontmatter type: concept->concepts/, entity->entities/,`,
        `  source->sources/, query->queries/, comparison->comparisons/, synthesis->synthesis/, archive->archive/.`,
        `- <slug> is lowercase-kebab-case with NO spaces (e.g. knowledge-compounding, not "Knowledge Compounding").`,
        `- NEVER create or overwrite wiki/purpose.md, wiki/overview.md, wiki/index.md, or wiki/log.md (reserved).`,
        `- One page per concept; if a page for it already exists, update that file instead of making a duplicate.`,
        ``,
        `For each maintenance item (contradiction, gap, suggestion):`,
        `---REVIEW: <type> | <title>---`,
        `<explanation>`,
        `---END REVIEW---`,
        ``,
        `Respect the subject boundary: never transfer claims between entities that share keywords.`,
    ].join("\n");
}
//# sourceMappingURL=ingest.js.map