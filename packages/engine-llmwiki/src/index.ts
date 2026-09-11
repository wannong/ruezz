import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type AskResult,
  type GraphDto,
  type IngestResult,
  type LintIssue,
  type PageContent,
  type PageSummary,
  type VaultSettings,
  type WikiEngine,
} from "@wikihome/engine-api";
import { createLlmClient, type LlmClient } from "@wikihome/llm";
import { createWiki, type Wiki } from "llmwiki-core";
import { ingestWholeDocument, slugify } from "./ingest-document.js";

type WikiHandle = Wiki & {
  close(): void;
};

function normalizePageId(idOrPath: string): string {
  const cleaned = idOrPath
    .replace(/\\/g, "/")
    .replace(/^wiki\//, "")
    .replace(/\.md$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("页面 id 无效");
  if (parts.some((p) => p === "." || p === ".." || /[<>:"|?*\u0000]/.test(p))) {
    throw new Error("页面 id 无效");
  }
  return parts.join("/");
}

function isInsideDir(dir: string, file: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function wikiDir(root: string): string {
  return path.join(path.resolve(root), "wiki");
}

function pageFile(root: string, id: string): string {
  const parts = id.split("/");
  const file = `${parts[parts.length - 1]}.md`;
  return path.join(wikiDir(root), ...parts.slice(0, -1), file);
}

function folderDir(root: string, id: string): string {
  return path.join(wikiDir(root), ...id.split("/"));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function dirHasMarkdown(abs: string): Promise<boolean> {
  const entries = await fs.readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) return true;
    if (entry.isDirectory() && (await dirHasMarkdown(path.join(abs, entry.name)))) return true;
  }
  return false;
}

function assertInsideWiki(root: string, target: string): void {
  if (!isInsideDir(wikiDir(root), target)) {
    throw new Error("只能操作 wiki/ 下的路径");
  }
}

function assertNotIntoSelf(fromId: string, toId: string): void {
  if (toId === fromId || toId.startsWith(`${fromId}/`)) {
    throw new Error("不能移动到自身内部");
  }
}

const STOCK_WIKI_DIRS = new Set([
  "entities",
  "concepts",
  "sources",
  "queries",
  "comparisons",
  "synthesis",
  "archive",
]);

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
    const wiki = this.getWiki(absRoot);
    await wiki.init();
    return ingestWholeDocument({
      root: absRoot,
      filePath,
      reindex: () => wiki.reindex(),
    });
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
    const { pages } = await wiki.load();
    return pages.map((p) => ({
      id: p.id,
      title: p.fm?.title,
      type: p.fm?.type ? String(p.fm.type) : undefined,
      path: p.path,
      tags: p.fm?.tags?.length ? p.fm.tags : undefined,
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
    const id = normalizePageId(idOrPath);
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

  async writePage(root: string, idOrPath: string, raw: string): Promise<PageContent> {
    const absRoot = path.resolve(root);
    const id = normalizePageId(idOrPath);
    const existing = await this.readPage(absRoot, id);
    if (!existing) throw new Error(`页面不存在：${id}`);

    const absFile = path.resolve(absRoot, existing.path);
    assertInsideWiki(absRoot, absFile);

    const content = raw.endsWith("\n") ? raw : `${raw}\n`;
    await fs.writeFile(absFile, content, "utf8");
    await this.getWiki(absRoot).reindex();
    const updated = await this.readPage(absRoot, id);
    if (!updated) throw new Error("写入后无法读取页面");
    return updated;
  }

  async createPage(root: string, idOrPath: string, title?: string): Promise<PageContent> {
    const absRoot = path.resolve(root);
    const id = normalizePageId(idOrPath);
    const absFile = pageFile(absRoot, id);
    assertInsideWiki(absRoot, absFile);

    try {
      await fs.access(absFile);
      throw new Error(`页面已存在：${id}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    const heading = title?.trim() || id.split("/").pop() || id;
    const day = new Date().toISOString().slice(0, 10);
    const stub = `---
type: concept
title: ${JSON.stringify(heading)}
created: ${day}
updated: ${day}
---

`;
    await fs.mkdir(path.dirname(absFile), { recursive: true });
    await fs.writeFile(absFile, stub, "utf8");
    await this.getWiki(absRoot).reindex();
    const created = await this.readPage(absRoot, id);
    if (!created) throw new Error("创建后无法读取页面");
    return created;
  }

  async copyPage(root: string, fromId: string, toId: string): Promise<PageContent> {
    const absRoot = path.resolve(root);
    const srcId = normalizePageId(fromId);
    const destId = normalizePageId(toId);
    const src = await this.readPage(absRoot, srcId);
    if (!src) throw new Error(`页面不存在：${srcId}`);
    const srcFile = path.resolve(absRoot, src.path);
    const destFile = pageFile(absRoot, destId);
    assertInsideWiki(absRoot, srcFile);
    assertInsideWiki(absRoot, destFile);
    if (await pathExists(destFile)) throw new Error(`页面已存在：${destId}`);
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    await fs.copyFile(srcFile, destFile);
    await this.getWiki(absRoot).reindex();
    const copied = await this.readPage(absRoot, destId);
    if (!copied) throw new Error("复制后无法读取页面");
    return copied;
  }

  async renamePage(root: string, fromId: string, toId: string): Promise<PageContent> {
    const absRoot = path.resolve(root);
    const srcId = normalizePageId(fromId);
    const destId = normalizePageId(toId);
    if (srcId === destId) {
      const same = await this.readPage(absRoot, srcId);
      if (!same) throw new Error(`页面不存在：${srcId}`);
      return same;
    }
    const src = await this.readPage(absRoot, srcId);
    if (!src) throw new Error(`页面不存在：${srcId}`);
    const srcFile = path.resolve(absRoot, src.path);
    const destFile = pageFile(absRoot, destId);
    assertInsideWiki(absRoot, srcFile);
    assertInsideWiki(absRoot, destFile);
    if (await pathExists(destFile)) throw new Error(`页面已存在：${destId}`);
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    await fs.rename(srcFile, destFile);
    await this.getWiki(absRoot).reindex();
    const renamed = await this.readPage(absRoot, destId);
    if (!renamed) throw new Error("重命名后无法读取页面");
    return renamed;
  }

  async listFolders(root: string): Promise<string[]> {
    const dir = wikiDir(root);
    if (!(await pathExists(dir))) return [];
    const out: string[] = [];
    const walk = async (abs: string, rel: string): Promise<void> => {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const id = rel ? `${rel}/${entry.name}` : entry.name;
        const childAbs = path.join(abs, entry.name);
        if (!(await dirHasMarkdown(childAbs)) && !STOCK_WIKI_DIRS.has(id)) out.push(id);
        await walk(childAbs, id);
      }
    };
    await walk(dir, "");
    return out;
  }

  async createFolder(root: string, idOrPath: string): Promise<{ id: string }> {
    const absRoot = path.resolve(root);
    const id = normalizePageId(idOrPath);
    const dest = folderDir(absRoot, id);
    assertInsideWiki(absRoot, dest);
    if (await pathExists(dest)) throw new Error(`文件夹已存在：${id}`);
    await fs.mkdir(dest, { recursive: true });
    return { id };
  }

  async copyFolder(root: string, fromId: string, toId: string): Promise<{ id: string }> {
    const absRoot = path.resolve(root);
    const srcId = normalizePageId(fromId);
    const destId = normalizePageId(toId);
    const src = folderDir(absRoot, srcId);
    const dest = folderDir(absRoot, destId);
    assertInsideWiki(absRoot, src);
    assertInsideWiki(absRoot, dest);
    if (!(await pathExists(src))) throw new Error(`文件夹不存在：${srcId}`);
    if (await pathExists(dest)) throw new Error(`文件夹已存在：${destId}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(src, dest, { recursive: true });
    await this.getWiki(absRoot).reindex();
    return { id: destId };
  }

  async renameFolder(root: string, fromId: string, toId: string): Promise<{ id: string }> {
    const absRoot = path.resolve(root);
    const srcId = normalizePageId(fromId);
    const destId = normalizePageId(toId);
    if (srcId === destId) return { id: destId };
    assertNotIntoSelf(srcId, destId);
    const src = folderDir(absRoot, srcId);
    const dest = folderDir(absRoot, destId);
    assertInsideWiki(absRoot, src);
    assertInsideWiki(absRoot, dest);
    if (!(await pathExists(src))) throw new Error(`文件夹不存在：${srcId}`);
    if (await pathExists(dest)) throw new Error(`文件夹已存在：${destId}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
    await this.getWiki(absRoot).reindex();
    return { id: destId };
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

  async getGraph(root: string): Promise<GraphDto> {
    const wiki = this.getWiki(root);
    const graph = await wiki.getGraph();
    return {
      nodes: [...graph.nodes.values()].map((n) => ({
        id: n.id,
        type: String(n.type),
        label: n.label,
        degree: n.degree,
      })),
      edges: graph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
      })),
      dataVersion: graph.dataVersion,
    };
  }

  async backlinks(root: string, pageId: string): Promise<PageSummary[]> {
    const wiki = this.getWiki(root);
    const ids = await wiki.impactSurface(pageId);
    const all = await this.listPages(root);
    const byId = new Map(all.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id) ?? { id });
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
