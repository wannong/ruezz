import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createWiki, MockLlm } from "./index.js";
/** Scripted mock that mirrors the CLI's --mock responder. */
function mockLlm() {
    return new MockLlm((msgs) => {
        const last = msgs.at(-1)?.content ?? "";
        if (last.includes("produce a structured analysis")) {
            return "Key concept: attention. Connects to transformers.";
        }
        if (last.includes("write the wiki pages")) {
            return [
                "---FILE: wiki/concepts/attention.md---",
                "---",
                "type: concept",
                "title: Attention",
                "tags: [transformers, attention]",
                'related: ["concepts/transformers"]',
                "sources: []",
                "created: 2026-01-01",
                "updated: 2026-01-01",
                "confidence: EXTRACTED",
                "---",
                "",
                "Attention lets a model focus on relevant input. See [[concepts/transformers]].",
                "---END FILE---",
            ].join("\n");
        }
        return "Attention lets a model focus on the relevant parts of the input [[concepts/attention]].";
    });
}
const tmpRoots = [];
async function freshKb() {
    const dir = path.join(os.tmpdir(), `llmwiki-e2e-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    tmpRoots.push(dir);
    return dir;
}
afterEach(async () => {
    // Windows + WAL can briefly hold the SQLite file after close(); retry removal.
    await Promise.all(tmpRoots.splice(0).map(async (d) => {
        for (let i = 0; i < 6; i++) {
            try {
                await fs.rm(d, { recursive: true, force: true });
                return;
            }
            catch {
                await new Promise((r) => setTimeout(r, 60));
            }
        }
    }));
});
describe("M1 end-to-end (deterministic core + mock LLM)", () => {
    it("runs init → ingest → search → ask → lint", async () => {
        const root = await freshKb();
        const wiki = createWiki(root, { llm: mockLlm() });
        // init scaffolds the KB.
        await wiki.init();
        await fs.access(path.join(root, "wiki", "purpose.md"));
        // drop a raw source and ingest it.
        const srcRel = path.join("raw", "sources", "test", "paper.md");
        await fs.mkdir(path.join(root, path.dirname(srcRel)), { recursive: true });
        await fs.writeFile(path.join(root, srcRel), "We propose attention.\n", "utf8");
        const ingest = await wiki.ingest({ sourcePath: srcRel });
        expect(ingest.files.length).toBe(1);
        await fs.access(path.join(root, "wiki", "concepts", "attention.md"));
        // search finds the compiled page.
        const hits = await wiki.search("attention");
        expect(hits.map((h) => h.pageId)).toContain("concepts/attention");
        // ask returns a wiki-grounded answer.
        const answer = await wiki.ask("what is attention?");
        expect(answer.length).toBeGreaterThan(0);
        expect(answer).toContain("attention");
        // lint flags the dangling [[concepts/transformers]] link (no such page yet).
        const issues = await wiki.lint();
        expect(issues.some((i) => i.rule === "broken-wikilink")).toBe(true);
        wiki.close();
    });
    it("maintains: fills a knowledge gap with a stub page (owned maintenance loop)", async () => {
        const root = await freshKb();
        const llm = new MockLlm((msgs) => {
            const last = msgs.at(-1)?.content ?? "";
            if (last.includes("Draft a concise stub page")) {
                return [
                    "---FILE: wiki/concepts/missing-concept.md---",
                    "---",
                    "type: concept",
                    "title: Missing Concept",
                    "tags: [stub, gap]",
                    "related: []",
                    "sources: []",
                    "created: 2026-01-01",
                    "updated: 2026-01-01",
                    "confidence: INFERRED",
                    "---",
                    "",
                    "A stub created by the maintenance loop.",
                    "---END FILE---",
                ].join("\n");
            }
            return "ok";
        });
        const wiki = createWiki(root, { llm });
        await wiki.init();
        await fs.mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
        await fs.writeFile(path.join(root, "wiki", "concepts", "a.md"), "---\ntype: concept\ntitle: A\ntags: [x, y]\n---\nSee [[concepts/missing-concept]].\n", "utf8");
        const r = await wiki.maintain({});
        expect(r.ran).toBe(true);
        expect((r.written ?? 0)).toBeGreaterThanOrEqual(1);
        await fs.access(path.join(root, "wiki", "concepts", "missing-concept.md"));
        wiki.close();
    });
    it("deterministic methods work with no LLM at all", async () => {
        const root = await freshKb();
        const wiki = createWiki(root); // no llm
        await fs.mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
        await fs.writeFile(path.join(root, "wiki", "concepts", "x.md"), "---\ntype: concept\ntitle: X\ntags: [a, b]\nrelated: [concepts/y]\n---\nLinks [[concepts/y]].\n", "utf8");
        await fs.writeFile(path.join(root, "wiki", "concepts", "y.md"), "---\ntype: concept\ntitle: Y\ntags: [a, b]\n---\nBack.\n", "utf8");
        const pages = await wiki.listPages();
        expect(pages.map((p) => p.id).sort()).toEqual(["concepts/x", "concepts/y"]);
        const issues = await wiki.lint();
        // two well-formed, mutually-linked pages → no issues
        expect(issues).toEqual([]);
        wiki.close();
    });
});
//# sourceMappingURL=e2e.test.js.map