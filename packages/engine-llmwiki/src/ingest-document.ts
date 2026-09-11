import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IngestResult } from "@wikihome/engine-api";
import { parseFrontmatter, sourceIdentityForPath } from "llmwiki-core";
import { convertFileToMarkdown, isConvertibleExtension } from "./markitdown.js";

export const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".text"]);

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

export function titleFromMarkdown(body: string, fallback: string): string {
  const heading = body.match(/^#\s+(.+)$/m);
  const title = heading?.[1]?.trim();
  return title || fallback;
}

export function oneLineSummary(body: string): string {
  const line =
    body
      .split(/\r?\n/)
      .map((row) => row.replace(/^#+\s*/, "").trim())
      .find(Boolean) || "imported source";
  return line.replace(/\|/g, "/").slice(0, 80);
}

export function isProbablyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8000);
  return !sample.includes(0);
}

export function buildSourcePage(opts: {
  title: string;
  body: string;
  tags: string[];
  related: string[];
  sources: string[];
  created: string;
  updated: string;
}): string {
  const body = opts.body.replace(/^\uFEFF/, "").replace(/^\n+/, "");
  const lines = [
    "---",
    "type: source",
    `title: ${JSON.stringify(opts.title)}`,
    `tags: ${formatYamlList(opts.tags)}`,
    `related: ${formatYamlList(opts.related)}`,
    `sources: ${formatYamlList(opts.sources)}`,
    `created: ${opts.created}`,
    `updated: ${opts.updated}`,
    "confidence: EXTRACTED",
    "---",
    "",
    body,
  ];
  const text = lines.join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

export async function ingestWholeDocument(opts: {
  root: string;
  filePath: string;
  reindex: () => Promise<void>;
}): Promise<IngestResult> {
  const absRoot = path.resolve(opts.root);
  const absFile = path.resolve(opts.filePath);
  const info = await fs.stat(absFile).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`找不到文件：${opts.filePath}`);
  }

  await fs.mkdir(path.join(absRoot, "raw", "sources"), { recursive: true });
  await fs.mkdir(path.join(absRoot, "wiki", "sources"), { recursive: true });

  const archivedAbs = await archiveIntoSources(absRoot, absFile);
  const markdown = await loadMarkdownText(archivedAbs);
  if (!markdown.trim()) {
    throw new Error(`入库内容为空：${path.basename(archivedAbs)}`);
  }

  const parsed = parseFrontmatter(markdown);
  const body = parsed.body || markdown;
  const fallbackTitle = path.basename(archivedAbs).replace(/\.[^.]+$/u, "") || "untitled";
  const title = String(parsed.frontmatter?.title || titleFromMarkdown(body, fallbackTitle));
  const day = new Date().toISOString().slice(0, 10);
  const originalId = sourceIdentityForPath(absRoot, archivedAbs);
  const sourceIds = uniqueStrings([originalId, ...asStringList(parsed.frontmatter?.sources)]);
  const tags = asStringList(parsed.frontmatter?.tags);
  const page = buildSourcePage({
    title,
    body,
    tags: tags.length ? tags : ["imported"],
    related: asStringList(parsed.frontmatter?.related),
    sources: sourceIds,
    created: String(parsed.frontmatter?.created || day),
    updated: day,
  });

  const stem = path.basename(archivedAbs).replace(/\.[^.]+$/u, "") || "source";
  const pageId = await uniqueSourcePageId(absRoot, slugify(stem), originalId);
  const pageAbs = path.join(absRoot, "wiki", "sources", `${pageId.split("/").pop()}.md`);
  await fs.mkdir(path.dirname(pageAbs), { recursive: true });
  await fs.writeFile(pageAbs, page, "utf8");

  const wikiRel = `wiki/sources/${path.basename(pageAbs)}`;
  await appendWikiLog(absRoot, `ingest | ${path.basename(archivedAbs)} — 1 page (whole document)`);
  await appendIndexRow(absRoot, pageId, oneLineSummary(body), day);
  await opts.reindex();

  return {
    files: [wikiRel],
    reviews: 0,
    sourcePath: path.relative(absRoot, archivedAbs).split(path.sep).join("/"),
  };
}

async function archiveIntoSources(root: string, absFile: string): Promise<string> {
  const rawDir = path.join(root, "raw", "sources");
  if (isUnderDir(rawDir, absFile)) return absFile;
  const dest = await uniqueFilePath(rawDir, path.basename(absFile));
  await fs.copyFile(absFile, dest);
  return dest;
}

async function loadMarkdownText(archivedAbs: string): Promise<string> {
  const ext = path.extname(archivedAbs).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return fs.readFile(archivedAbs, "utf8");
  }
  if (isConvertibleExtension(ext)) {
    const tmp = path.join(os.tmpdir(), `wikihome-md-${process.pid}-${Date.now()}.md`);
    try {
      await convertFileToMarkdown(archivedAbs, tmp);
      const markdown = await fs.readFile(tmp, "utf8");
      if (!markdown.trim()) {
        throw new Error(`转换结果为空：${path.basename(archivedAbs)}`);
      }
      return markdown;
    } finally {
      await fs.unlink(tmp).catch(() => undefined);
    }
  }

  const buf = await fs.readFile(archivedAbs);
  if (isProbablyText(buf)) {
    return buf.toString("utf8");
  }
  throw new Error(
    `无法直接入库「${path.basename(archivedAbs)}」。请导入 Markdown / 文本，或 PDF / Word / PPT / Excel（会先转成一篇 Markdown，不拆页）。`,
  );
}

async function uniqueSourcePageId(root: string, slug: string, sourceIdentity: string): Promise<string> {
  let candidate = `sources/${slug || "source"}`;
  for (let i = 2; i < 1000; i += 1) {
    const abs = path.join(root, "wiki", `${candidate}.md`);
    if (!(await pathExists(abs))) return candidate;
    const raw = await fs.readFile(abs, "utf8");
    const { frontmatter } = parseFrontmatter(raw);
    if (citesSource(asStringList(frontmatter?.sources), sourceIdentity)) return candidate;
    candidate = `sources/${slug || "source"}-${i}`;
  }
  throw new Error("无法为入库页面分配文件名");
}

function citesSource(sources: string[], identity: string): boolean {
  const ident = identity.replace(/\\/g, "/").toLowerCase();
  return sources.some((item) => {
    const value = item.replace(/\\/g, "/").toLowerCase();
    return value === ident || value.endsWith(`/${ident}`) || ident.endsWith(`/${value}`);
  });
}

async function uniqueFilePath(dir: string, filename: string): Promise<string> {
  const first = path.join(dir, filename);
  if (!(await pathExists(first))) return first;
  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  for (let i = 2; i < 1000; i += 1) {
    const dest = path.join(dir, `${stem}-${i}${ext}`);
    if (!(await pathExists(dest))) return dest;
  }
  throw new Error(`无法为 ${filename} 分配唯一文件名`);
}

async function appendWikiLog(root: string, line: string): Promise<void> {
  const logPath = path.join(root, "wiki", "log.md");
  let prev = "";
  try {
    prev = await fs.readFile(logPath, "utf8");
  } catch {
    prev = "# Log\n\n";
  }
  const stamp = new Date().toISOString().slice(0, 10);
  await fs.writeFile(logPath, `${prev.replace(/\s+$/, "")}\n## [${stamp}] ${line}\n`, "utf8");
}

async function appendIndexRow(root: string, pageId: string, summary: string, day: string): Promise<void> {
  const indexPath = path.join(root, "wiki", "index.md");
  let prev = "";
  try {
    prev = await fs.readFile(indexPath, "utf8");
  } catch {
    prev = "# Index\n\n| Page | Summary | Updated |\n| --- | --- | --- |\n";
  }
  const link = `[[${pageId}]]`;
  if (prev.includes(link)) return;
  if (!prev.endsWith("\n")) prev += "\n";
  await fs.writeFile(indexPath, `${prev}| ${link} | ${summary} | ${day} |\n`, "utf8");
}

function isUnderDir(dir: string, file: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function asStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.replace(/\\/g, "/");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function formatYamlList(values: string[]): string {
  if (values.length === 0) return "[]";
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}
