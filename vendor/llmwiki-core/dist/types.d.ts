/**
 * Core domain types shared across the engine.
 *
 * The deterministic core operates on these pure data shapes; no module here
 * imports an LLM client. See {@link LlmClient} for the single injected seam.
 */
export type PageType = "entity" | "concept" | "source" | "query" | "comparison" | "synthesis" | "overview" | "archive" | (string & {});
/** Epistemic confidence of a claim/page (from the skill project's ADR-23). */
export type Confidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS" | "UNVERIFIED";
/**
 * Validated, typed view of a wiki page's frontmatter. The parser
 * ({@link frontmatter.parseFrontmatter}) returns the raw `Record<string, string | string[]>`;
 * a validation step coerces that into this shape. Domain templates may add fields.
 */
export interface Frontmatter {
    type: PageType;
    title: string;
    tags: string[];
    /** Bare slugs of pages this one relates to (graph backbone). */
    related: string[];
    /** Stable source identities backing this page (graph backbone, weighted highest). */
    sources: string[];
    created: string;
    updated: string;
    confidence?: Confidence;
    [domain: string]: unknown;
}
export interface Page {
    /** Stable page id (slug), unique within the KB. */
    id: string;
    /** Path relative to the KB root, e.g. `wiki/concepts/foo.md`. */
    path: string;
    fm: Frontmatter | null;
    body: string;
    /** Full original file content (frontmatter block + body). */
    raw: string;
}
export interface SourceRef {
    /** Source identity (path under `raw/sources/`). */
    id: string;
    /** Path relative to the KB root. */
    path: string;
    title?: string;
}
export type RelationType = "links_to" | "cites";
export interface GraphNode {
    id: string;
    type: PageType | "source";
    label: string;
    /** Total degree (in + out) — a compounding/connectivity signal. */
    degree: number;
}
export interface GraphEdge {
    source: string;
    target: string;
    relation: RelationType;
    confidence?: Confidence;
}
export interface Graph {
    nodes: ReadonlyMap<string, GraphNode>;
    edges: ReadonlyArray<GraphEdge>;
    /** Bumped whenever the graph is rebuilt; lets caches invalidate. */
    dataVersion: number;
}
export interface LlmMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface LlmResponse {
    text: string;
}
export interface LlmCompleteOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
}
/**
 * The injected LLM client. The deterministic core never constructs one; callers
 * (the CLI/MCP/skill fronts, or an autonomous runner) provide an implementation.
 * A canned mock makes every consumer fully testable with no network.
 */
export interface LlmClient {
    complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmResponse>;
}
//# sourceMappingURL=types.d.ts.map