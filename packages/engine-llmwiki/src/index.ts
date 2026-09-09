import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type AskResult,
  type IngestResult,
  type LintIssue,
  type PageContent,
  type PageSummary,
  type VaultSettings,
  type WikiEngine,
} from "@wikihome/engine-api";
import { createLlmClient, type LlmClient } from "@wikihome/llm";
import { createWiki, type Wiki } from "llmwiki-core";

type WikiHandle = Wiki & {
  close(): void;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

export interface LlmWikiEngineOptions {
  settings: Pick<VaultSettings, "apiBaseUrl" | "apiKey" | "model" | "mock">;
}

export class LlmWikiEngine implements WikiEngine {
  private readonly handles = new Map<string, WikiHandle>();
  private readonly llm: LlmClient;

  constructor(private readonly options: LlmWikiEngineOptions) {
    this.llm = createLlmClient({
      mock: options.settings.mock,
      apiKey: options.settings.apiKey,
      baseUrl: options.settings.apiBaseUrl,
      model: options.settings.model,
    });
  }

  private getWiki(root: string): WikiHandle {
    const key = path.resolve(root);
    let wiki = this.handles.get(key);
    if (!wiki) {
      wiki = createWiki(key, { llm: this.llm }) as WikiHandle;
      this.handles.set(key, wiki);
    }
    return wiki;
  }

  async initVault(root: string): Promise<void> {
    const abs = path.resolve(root);
    await fs.mkdir(abs, { recursive: true });
    const wiki = this.getWiki(abs);
    await wiki.init();
    const metaDir = path.join(abs, ".wikihome");
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(
      path.join(metaDir, "meta.json"),
      JSON.stringify(
        {
          format: 1,
          engine: "llmwiki-core",
          engineVersion: "0.1.0",
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  async ingestFile(root: string, filePath: string): Promise<IngestResult> {
    const absRoot = path.resolve(root);
    const absFile = path.resolve(filePath);
    const wiki = this.getWiki(absRoot);
    await wiki.init();

    const rawDir = path.join(absRoot, "raw", "sources");
    await fs.mkdir(rawDir, { recursive: true });
    const base = path.basename(absFile);
    const dest = path.join(rawDir, base);
    if (path.resolve(dest) !== absFile) {
      await fs.copyFile(absFile, dest);
    }

    const rel = path.relative(absRoot, dest).split(path.sep).join("/");
    const result = await wiki.ingest({ sourcePath: rel });
    return { files: result.files, reviews: result.reviews, sourcePath: rel };
  }

  async ingestText(root: string, title: string, body: string): Promise<IngestResult> {
    const absRoot = path.resolve(root);
    const rawDir = path.join(absRoot, "raw", "sources");
    await fs.mkdir(rawDir, { recursive: true });
    const name = `${slugify(title)}.md`;
    const dest = path.join(rawDir, name);
    const content = `# ${title}\n\n${body}\n`;
    await fs.writeFile(dest, content, "utf8");
    return this.ingestFile(absRoot, dest);
  }

  async readIndex(root: string): Promise<string> {
    const indexPath = path.join(path.resolve(root), "wiki", "index.md");
    try {
      return await fs.readFile(indexPath, "utf8");
    } catch {
      return "";
    }
  }

  async listPages(root: string): Promise<PageSummary[]> {
    const wiki = this.getWiki(root);
    const pages = await wiki.listPages();
    return pages.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      path: `wiki/${p.id}.md`,
    }));
  }

  async findPages(root: string, query: string): Promise<PageSummary[]> {
    const wiki = this.getWiki(root);
    const hits = await wiki.search(query, { limit: 20 });
    const all = await this.listPages(root);
    const byId = new Map(all.map((p) => [p.id, p]));
    return hits.map((h) => byId.get(h.pageId) ?? { id: h.pageId, title: h.title });
  }

  async readPage(root: string, idOrPath: string): Promise<PageContent | null> {
    const wiki = this.getWiki(root);
    const id = idOrPath
      .replace(/^wiki\//, "")
      .replace(/\.md$/i, "")
      .replace(/\\/g, "/");
    const page = await wiki.read(id);
    if (!page) return null;
    return {
      id: page.id,
      path: page.path,
      title: page.fm?.title,
      type: page.fm?.type,
      body: page.body,
      raw: page.raw,
    };
  }

  async lint(root: string): Promise<LintIssue[]> {
    const wiki = this.getWiki(root);
    const issues = await wiki.lint({ fix: false });
    return issues.map((i) => ({
      pageId: i.pageId,
      severity: i.severity,
      rule: i.rule,
      message: i.message,
      autoFixable: i.autoFixable,
    }));
  }

  async ask(root: string, question: string): Promise<AskResult> {
    const wiki = this.getWiki(root);
    const answer = await wiki.ask(question);
    const sources = Array.from(answer.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1]);
    return { answer, sources };
  }

  close(root?: string): void {
    if (root) {
      const key = path.resolve(root);
      const wiki = this.handles.get(key);
      wiki?.close();
      this.handles.delete(key);
      return;
    }
    for (const wiki of this.handles.values()) wiki.close();
    this.handles.clear();
  }
}

export function createEngine(settings: LlmWikiEngineOptions["settings"]): WikiEngine {
  return new LlmWikiEngine({ settings });
}
