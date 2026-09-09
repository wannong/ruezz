import { type LintIssue } from "./lint.js";
import { type HealthScorecard } from "./eval.js";
import { type MaintenancePlan } from "./maintain.js";
import type { Graph, LlmClient, Page, SourceRef } from "./types.js";
interface WikiState {
    healthHistory: Array<{
        at: string;
        composite: number;
    }>;
    lastMaintainedAt: string | null;
    signals: {
        staleCount: number;
        openIssues: number;
        proposedPages: number;
    };
}
export interface MaintainResult {
    ran: boolean;
    reason?: string;
    plan: MaintenancePlan;
    written?: number;
    staleCleared?: number;
}
export interface WikiOptions {
    llm?: LlmClient;
}
export interface IngestArgs {
    /** Path to a source file under raw/sources/ (or anywhere under root). */
    sourcePath: string;
}
export declare class Wiki {
    private readonly root;
    private readonly opts;
    private store;
    constructor(root: string, opts?: WikiOptions);
    /** Whether an LLM client was injected (ingest/ask/maintain need one). */
    get hasLlm(): boolean;
    /** Scaffold a fresh KB. */
    init(): Promise<void>;
    private ensureFile;
    /** Read all wiki pages + sources, returning parsed pages, sources, and a fresh graph. */
    load(): Promise<{
        pages: Page[];
        sources: SourceRef[];
        graph: Graph;
    }>;
    private readPages;
    private readSources;
    /** Rebuild the derived store index from disk. */
    reindex(): Promise<void>;
    /** Ingest a source via the two-step pipeline and write the generated pages. */
    ingest(args: IngestArgs): Promise<{
        files: string[];
        reviews: number;
    }>;
    /** Ask a question against the wiki (hybrid retrieval + synthesis). */
    ask(question: string): Promise<string>;
    /** Hybrid search over the index. */
    search(query: string, opts?: {
        limit?: number;
    }): Promise<{
        pageId: string;
        title?: string;
    }[]>;
    /** Retrieve a packed context block for a query (deterministic; no LLM needed). */
    retrieveContext(query: string): Promise<{
        hits: unknown[];
        contextBlock: string;
    }>;
    /** Two-tier lint; with `fix`, applies Tier-1 patches and writes them back. */
    lint(opts?: {
        fix?: boolean;
    }): Promise<LintIssue[]>;
    listPages(): Promise<{
        id: string;
        title?: string;
        type?: string;
    }[]>;
    read(id: string): Promise<Page | null>;
    getGraph(): Promise<Graph>;
    /** Read-only impact surface: pages that reference `pageId` (would go stale if it changed). */
    impactSurface(pageId: string): Promise<string[]>;
    /** Mark the impact surface of `pageId` stale in the derived index (monotonic). */
    propagateStaleness(pageId: string): Promise<string[]>;
    /** Pages currently marked stale in the derived index. */
    findStale(): Promise<string[]>;
    /** Structural insights: knowledge gaps (proposed pages), hubs, connected components. */
    insights(): Promise<{
        gaps: Array<{
            target: string;
            referencedBy: string[];
        }>;
        hubs: Array<{
            id: string;
            degree: number;
        }>;
        components: string[][];
    }>;
    /** Compute the health scorecard and append a trend point to state.json. */
    health(): Promise<{
        scorecard: HealthScorecard;
        trend?: number;
    }>;
    /**
     * Run the owned maintenance loop: fill knowledge gaps (propose stub pages) and
     * refresh stale pages from their sources. With `auto`, it no-ops unless enough
     * signal has accumulated — safe to wire to a post-ingest hook or cron.
     */
    maintain(opts?: {
        auto?: boolean;
        maxPropose?: number;
        minSignal?: number;
    }): Promise<MaintainResult>;
    close(): void;
    private get statePath();
    readState(): Promise<WikiState>;
    writeState(state: WikiState): Promise<void>;
    private readContext;
    private appendLog;
    /** Write a model-generated page (path may or may not include the `wiki/` prefix). */
    private writeGenerated;
    /** Read a source's text content by identity (path under raw/sources/). */
    private readSourceContent;
}
/** Factory for a {@link Wiki} handle. */
export declare function createWiki(root: string, opts?: WikiOptions): Wiki;
export {};
//# sourceMappingURL=wiki.d.ts.map