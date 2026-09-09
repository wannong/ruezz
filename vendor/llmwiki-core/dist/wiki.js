import { promises as fs } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { buildGraph } from "./graph.js";
import { runIngest } from "./ingest-runner.js";
import { applyLintFixes, lintPages } from "./lint.js";
import { normalizePath } from "./paths.js";
import { sourceIdentityForPath } from "./source-identity.js";
import { Store } from "./store.js";
import { computeContextBudget } from "./context-budget.js";
import { retrieve } from "./retrieval.js";
import { impactSurface } from "./staleness.js";
import { connectedComponents, findHubs, findKnowledgeGaps } from "./graph-insights.js";
import { scoreHealth } from "./eval.js";
import { buildProposePrompt, buildRefreshPrompt, planMaintenance } from "./maintain.js";
import { parseIngestBlocks } from "./ingest-parser.js";
/**
 * The composition root: a {@link Wiki} handle bound to a KB root and an optional
 * injected {@link LlmClient}. The deterministic methods (`load`, `search`,
 * `lint`, `listPages`, `read`, `getGraph`) work with no model; the LLM methods
 * (`ingest`, `ask`) require one.
 *
 * Filesystem layout under `root`:
 *   raw/sources/...   immutable sources (truth)
 *   wiki/...          compiled pages (engine-owned)
 *   .llmwiki/         derived index (disposable, rebuildable)
 */
const WIKI_TYPES = ["entities", "concepts", "sources", "queries", "comparisons", "synthesis", "archive"];
export class Wiki {
    root;
    opts;
    store;
    constructor(root, opts = {}) {
        this.root = root;
        this.opts = opts;
        mkdirSync(path.join(root, ".llmwiki"), { recursive: true });
        this.store = new Store(path.join(root, ".llmwiki", "index.db"));
    }
    /** Whether an LLM client was injected (ingest/ask/maintain need one). */
    get hasLlm() {
        return !!this.opts.llm;
    }
    // --- lifecycle ---------------------------------------------------------
    /** Scaffold a fresh KB. */
    async init() {
        await fs.mkdir(path.join(this.root, "raw", "sources"), { recursive: true });
        for (const t of WIKI_TYPES)
            await fs.mkdir(path.join(this.root, "wiki", t), { recursive: true });
        await this.ensureFile("wiki/purpose.md", PURPOSE_TEMPLATE);
        await this.ensureFile("wiki/overview.md", "# Overview\n\n_(empty — grows as you ingest sources)_\n");
        await this.ensureFile("wiki/index.md", "# Index\n\n| Page | Summary | Updated |\n| --- | --- | --- |\n");
        await this.ensureFile("wiki/log.md", "# Log\n\n");
        await fs.mkdir(path.join(this.root, ".llmwiki"), { recursive: true });
    }
    async ensureFile(rel, content) {
        const full = path.join(this.root, rel);
        try {
            await fs.stat(full);
        }
        catch {
            await fs.mkdir(path.dirname(full), { recursive: true });
            await fs.writeFile(full, content, "utf8");
        }
    }
    // --- reading -----------------------------------------------------------
    /** Read all wiki pages + sources, returning parsed pages, sources, and a fresh graph. */
    async load() {
        const pages = await this.readPages();
        const sources = await this.readSources();
        const graph = buildGraph(pages, sources);
        return { pages, sources, graph };
    }
    async readPages() {
        const wikiDir = path.join(this.root, "wiki");
        const files = await walkMd(wikiDir);
        const pages = [];
        for (const abs of files) {
            const raw = await fs.readFile(abs, "utf8");
            const rel = normalizePath(path.relative(wikiDir, abs)).replace(/\.md$/i, "");
            const { frontmatter, body } = parseFrontmatter(raw);
            pages.push({
                id: rel,
                path: normalizePath(`wiki/${rel}.md`),
                fm: frontmatter ? coerceFrontmatter(frontmatter) : null,
                body,
                raw,
            });
        }
        return pages;
    }
    async readSources() {
        const srcDir = path.join(this.root, "raw", "sources");
        let files = [];
        try {
            files = await walkAll(srcDir);
        }
        catch {
            files = [];
        }
        return files.map((abs) => {
            const id = sourceIdentityForPath(this.root, abs);
            return { id, path: normalizePath(path.relative(this.root, abs)), title: path.basename(abs) };
        });
    }
    /** Rebuild the derived store index from disk. */
    async reindex() {
        const { pages } = await this.load();
        this.store.rebuild(pages.map((p) => toStoreEntry(p)));
    }
    // --- operations --------------------------------------------------------
    /** Ingest a source via the two-step pipeline and write the generated pages. */
    async ingest(args) {
        if (!this.opts.llm)
            throw new Error("ingest requires an LLM client");
        const abs = path.resolve(this.root, args.sourcePath);
        const content = await fs.readFile(abs, "utf8");
        const ctx = await this.readContext();
        const source = { title: path.basename(abs), content };
        const blocks = await runIngest(source, ctx, this.opts.llm);
        for (const f of blocks.files) {
            await this.writeGenerated(f.path, f.content);
        }
        await this.appendLog(`ingest | ${path.basename(abs)} — ${blocks.files.length} page(s)`);
        await this.reindex();
        return { files: blocks.files.map((f) => f.path), reviews: blocks.reviews.length };
    }
    /** Ask a question against the wiki (hybrid retrieval + synthesis). */
    async ask(question) {
        if (!this.opts.llm)
            throw new Error("ask requires an LLM client");
        await this.reindex();
        const { pages, graph } = await this.load();
        const { contextBlock } = await retrieve({
            query: question,
            store: this.store,
            graph,
            pages,
            budget: computeContextBudget(204_800),
        });
        const { text } = await this.opts.llm.complete([
            {
                role: "system",
                content: "Answer the user's question using ONLY the wiki context below. " +
                    "Cite pages as [[page-id]]. If the context is insufficient, say so.",
            },
            {
                role: "user",
                content: `## Wiki context\n${contextBlock || "(no relevant pages found)"}\n\n## Question\n${question}`,
            },
        ]);
        return text;
    }
    /** Hybrid search over the index. */
    async search(query, opts) {
        await this.reindex();
        return this.store.search(query, opts).map((h) => ({ pageId: h.pageId, ...(h.title ? { title: h.title } : {}) }));
    }
    /** Retrieve a packed context block for a query (deterministic; no LLM needed). */
    async retrieveContext(query) {
        await this.reindex();
        const { pages, graph } = await this.load();
        const res = await retrieve({
            query,
            store: this.store,
            graph,
            pages,
            budget: computeContextBudget(204_800),
        });
        return { hits: res.hits, contextBlock: res.contextBlock };
    }
    /** Two-tier lint; with `fix`, applies Tier-1 patches and writes them back. */
    async lint(opts) {
        const { pages, sources, graph } = await this.load();
        let issues = lintPages(pages, sources, graph);
        if (opts?.fix) {
            const fixed = applyLintFixes(pages, issues);
            const oldByPath = new Map(pages.map((p) => [p.path, p]));
            // 1. Body/link rewrites for pages that stay in place.
            for (const p of fixed) {
                const orig = oldByPath.get(p.path);
                if (orig && p.body !== orig.body) {
                    await fs.writeFile(path.join(this.root, p.path), p.raw, "utf8");
                }
            }
            // 2. Relocate misplaced pages (copy rewritten content, delete old).
            for (const m of issues) {
                const fix = m.fix;
                if (!m.autoFixable || !fix || fix.kind !== "move-page")
                    continue;
                const from = path.join(this.root, fix.fromPath);
                const to = path.join(this.root, fix.toPath);
                const fixedPage = fixed.find((fp) => fp.path === fix.toPath);
                await fs.mkdir(path.dirname(to), { recursive: true });
                const content = fixedPage?.raw ?? (await fs.readFile(from, "utf8"));
                await fs.writeFile(to, content, "utf8");
                await fs.rm(from, { force: true });
            }
            // Recompute remaining issues after fixes.
            const { pages: p2, sources: s2, graph: g2 } = await this.load();
            issues = lintPages(p2, s2, g2);
        }
        return issues;
    }
    async listPages() {
        const { pages } = await this.load();
        return pages.map((p) => ({
            id: p.id,
            ...(p.fm?.title ? { title: p.fm.title } : {}),
            ...(p.fm?.type ? { type: String(p.fm.type) } : {}),
        }));
    }
    async read(id) {
        const { pages } = await this.load();
        return pages.find((p) => p.id === id) ?? null;
    }
    async getGraph() {
        const { graph } = await this.load();
        return graph;
    }
    /** Read-only impact surface: pages that reference `pageId` (would go stale if it changed). */
    async impactSurface(pageId) {
        const { graph } = await this.load();
        return impactSurface(pageId, graph);
    }
    /** Mark the impact surface of `pageId` stale in the derived index (monotonic). */
    async propagateStaleness(pageId) {
        const stale = await this.impactSurface(pageId);
        for (const id of stale)
            this.store.markStale(id);
        return stale;
    }
    /** Pages currently marked stale in the derived index. */
    async findStale() {
        return this.store.findStale().map((r) => r.id);
    }
    /** Structural insights: knowledge gaps (proposed pages), hubs, connected components. */
    async insights() {
        const { graph } = await this.load();
        return {
            gaps: findKnowledgeGaps(graph),
            hubs: findHubs(graph).map((h) => ({ id: h.id, degree: h.degree })),
            components: connectedComponents(graph),
        };
    }
    /** Compute the health scorecard and append a trend point to state.json. */
    async health() {
        const { pages, graph } = await this.load();
        const staleCount = this.store.findStale().length;
        const scorecard = scoreHealth({ pages, graph, staleCount });
        const state = await this.readState();
        const prev = state.healthHistory.at(-1)?.composite;
        state.healthHistory.push({ at: new Date().toISOString(), composite: scorecard.composite });
        if (state.healthHistory.length > 20)
            state.healthHistory = state.healthHistory.slice(-20);
        state.lastMaintainedAt = state.lastMaintainedAt ?? null;
        await this.writeState(state);
        return { scorecard, ...(prev !== undefined ? { trend: scorecard.composite - prev } : {}) };
    }
    /**
     * Run the owned maintenance loop: fill knowledge gaps (propose stub pages) and
     * refresh stale pages from their sources. With `auto`, it no-ops unless enough
     * signal has accumulated — safe to wire to a post-ingest hook or cron.
     */
    async maintain(opts) {
        if (!this.opts.llm)
            throw new Error("maintain requires an LLM client");
        const { pages, sources, graph } = await this.load();
        const pageIds = new Set(pages.map((p) => p.id));
        const stalePageIds = (await this.findStale()).filter((id) => pageIds.has(id));
        const gaps = findKnowledgeGaps(graph);
        const issues = lintPages(pages, sources, graph);
        const plan = planMaintenance({ stalePageIds, gaps, lintIssues: issues, maxPropose: opts?.maxPropose });
        const signal = stalePageIds.length + plan.counts.propose + plan.counts.review;
        if (opts?.auto && signal < (opts?.minSignal ?? 1)) {
            return { ran: false, reason: "not enough accumulated signal", plan };
        }
        const byId = new Map(pages.map((p) => [p.id, p]));
        let written = 0;
        let staleCleared = 0;
        for (const task of plan.tasks) {
            if (task.kind === "propose" && task.target) {
                const gap = gaps.find((g) => g.target === task.target);
                if (!gap)
                    continue;
                const snippets = gap.referencedBy.map((id) => byId.get(id)?.body.slice(0, 500) ?? "").join("\n---\n");
                const { text } = await this.opts.llm.complete([
                    { role: "user", content: buildProposePrompt(gap, snippets) },
                ]);
                for (const f of parseIngestBlocks(text).files) {
                    await this.writeGenerated(f.path, f.content);
                    written++;
                }
            }
            else if (task.kind === "resynthesize" && task.pageId) {
                const page = byId.get(task.pageId);
                if (!page)
                    continue;
                const sourceSnippets = (await Promise.all((page.fm?.sources ?? []).map((s) => this.readSourceContent(s)))).join("\n---\n");
                const { text } = await this.opts.llm.complete([
                    { role: "user", content: buildRefreshPrompt(task.pageId, page.body, sourceSnippets) },
                ]);
                const blocks = parseIngestBlocks(text);
                const match = blocks.files.find((f) => f.path.replace(/\.md$/i, "").endsWith(task.pageId)) ?? blocks.files[0];
                if (match) {
                    await this.writeGenerated(match.path, match.content);
                    written++;
                }
                this.store.clearStale(task.pageId);
                staleCleared++;
            }
        }
        await this.appendLog(`maintain | ${plan.counts.propose} gap(s) addressed, ${stalePageIds.length} stale page(s) reviewed`);
        const state = await this.readState();
        state.lastMaintainedAt = new Date().toISOString();
        state.signals = {
            staleCount: stalePageIds.length,
            openIssues: plan.counts.review,
            proposedPages: plan.counts.propose,
        };
        await this.writeState(state);
        await this.reindex();
        return { ran: true, plan, written, staleCleared };
    }
    close() {
        this.store.close();
    }
    // --- state ---------------------------------------------------------------
    get statePath() {
        return path.join(this.root, ".llmwiki", "state.json");
    }
    async readState() {
        try {
            const raw = await fs.readFile(this.statePath, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return { healthHistory: [], lastMaintainedAt: null, signals: { staleCount: 0, openIssues: 0, proposedPages: 0 } };
        }
    }
    async writeState(state) {
        await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), "utf8");
    }
    // --- helpers -----------------------------------------------------------
    async readContext() {
        let purpose;
        let index;
        try {
            purpose = await fs.readFile(path.join(this.root, "wiki", "purpose.md"), "utf8");
        }
        catch {
            /* undefined */
        }
        try {
            index = await fs.readFile(path.join(this.root, "wiki", "index.md"), "utf8");
        }
        catch {
            /* undefined */
        }
        return { purpose, index };
    }
    async appendLog(line) {
        const stamp = new Date().toISOString().slice(0, 10);
        const logPath = path.join(this.root, "wiki", "log.md");
        let prev = "";
        try {
            prev = await fs.readFile(logPath, "utf8");
        }
        catch {
            prev = "# Log\n\n";
        }
        await fs.writeFile(logPath, `${prev.replace(/\s+$/, "")}\n## [${stamp}] ${line}\n`, "utf8");
    }
    /** Write a model-generated page (path may or may not include the `wiki/` prefix). */
    async writeGenerated(relPath, content) {
        const rel = relPath.replace(/^\/+/, "");
        const target = rel.startsWith("wiki/") ? rel : `wiki/${rel}`;
        await fs.mkdir(path.dirname(path.join(this.root, target)), { recursive: true });
        await fs.writeFile(path.join(this.root, target), content.endsWith("\n") ? content : `${content}\n`, "utf8");
    }
    /** Read a source's text content by identity (path under raw/sources/). */
    async readSourceContent(sourceId) {
        try {
            return await fs.readFile(path.join(this.root, "raw", "sources", sourceId), "utf8");
        }
        catch {
            return "";
        }
    }
}
/** Factory for a {@link Wiki} handle. */
export function createWiki(root, opts) {
    return new Wiki(root, opts);
}
const PURPOSE_TEMPLATE = `# Purpose

Describe the goal, key questions, and scope of this wiki. The maintainer reads
this on every ingest and query, so it shapes what gets emphasized.

## Key questions
- ...

## Scope
- ...
`;
// --- pure helpers --------------------------------------------------------
function toStoreEntry(p) {
    return {
        id: p.id,
        path: p.path,
        sourceKind: "wiki",
        ...(p.fm?.type ? { type: String(p.fm.type) } : {}),
        ...(p.fm?.title ? { title: p.fm.title } : {}),
        ...(p.fm?.tags ? { tags: p.fm.tags } : {}),
        content: p.body,
    };
}
function coerceFrontmatter(fm) {
    const str = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
    return {
        type: String(fm.type ?? "concept"),
        title: String(fm.title ?? ""),
        tags: str(fm.tags),
        related: str(fm.related),
        sources: str(fm.sources),
        created: String(fm.created ?? ""),
        updated: String(fm.updated ?? ""),
        ...(fm.confidence ? { confidence: String(fm.confidence) } : {}),
    };
}
async function walkMd(dir) {
    const out = [];
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory())
            out.push(...(await walkMd(full)));
        else if (e.isFile() && e.name.endsWith(".md"))
            out.push(full);
    }
    return out;
}
async function walkAll(dir) {
    const out = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory())
            out.push(...(await walkAll(full)));
        else if (e.isFile())
            out.push(full);
    }
    return out;
}
//# sourceMappingURL=wiki.js.map