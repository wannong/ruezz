import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, cp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pythonCandidates, spawnOnce } from "./markitdown.js";

export const PDF2MD_CONVERT_MS = 300_000;

export interface Pdf2mdLayoutOptions {
  inputAbs: string;
  /** Directory that will contain `{stem}.md`, `{stem}_assets/`, and optional formulas manifest. */
  outDir: string;
  inlineMath?: boolean;
  tableImage?: boolean;
  dpi?: number;
  signal?: AbortSignal;
}

export interface Pdf2mdLayoutResult {
  markdownAbs: string;
  markdown: string;
  assetsDir: string | null;
  formulasManifestAbs: string | null;
  stem: string;
}

/**
 * Convert a born-digital PDF to Markdown via the pdf2md-layout skill
 * (`pymupdf4llm` + glyph repair + figure/formula crops).
 */
export async function convertPdfWithPdf2mdLayout(
  options: Pdf2mdLayoutOptions,
): Promise<Pdf2mdLayoutResult> {
  const {
    inputAbs,
    outDir,
    inlineMath = true,
    tableImage = false,
    dpi,
    signal,
  } = options;

  await mkdir(outDir, { recursive: true });
  const scriptPath = findPdf2mdScript();
  const args = [scriptPath, inputAbs, "-o", outDir, "-q"];
  if (!inlineMath) args.push("--no-inline-math");
  if (tableImage) args.push("--table-image");
  if (dpi) args.push("--dpi", String(dpi));

  let lastError = "";
  let sawMissingModule = false;

  for (const bin of pythonCandidates()) {
    try {
      const result = await spawnOnce(bin, args, signal, PDF2MD_CONVERT_MS);
      if (result.code === 0) {
        return await readConversionOutput(inputAbs, outDir);
      }
      lastError = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      if (/no module named (pymupdf4llm|pymupdf|fitz)/i.test(lastError) || /missing dependency/i.test(lastError)) {
        sawMissingModule = true;
        continue;
      }
      continue;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/aborted|timeout/i.test(message)) {
        throw new Error("PDF 转换已取消或超时");
      }
      if (/ENOENT/i.test(message)) {
        lastError = `找不到 ${bin}`;
        continue;
      }
      lastError = message;
    }
  }

  if (sawMissingModule) {
    throw new Error(
      "未找到 pdf2md-layout 所需的 Python 包（pymupdf4llm）。" +
        "请用带 resources\\runtime\\python 的绿色包或安装包打开，或运行：pip install \"pymupdf4llm>=1.28\"",
    );
  }
  throw new Error(`PDF 转换失败：${lastError || "未找到 Python"}`);
}

/** Convert into a temp directory; caller should clean up `cleanupDir`. */
export async function convertPdfToTemp(
  inputAbs: string,
  signal?: AbortSignal,
): Promise<Pdf2mdLayoutResult & { cleanupDir: string }> {
  const cleanupDir = await mkdtemp(path.join(os.tmpdir(), "wikihome-pdf2md-"));
  try {
    const result = await convertPdfWithPdf2mdLayout({
      inputAbs,
      outDir: cleanupDir,
      signal,
    });
    return { ...result, cleanupDir };
  } catch (err) {
    await rm(cleanupDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Rewrite `{fromStem}_assets/...` references to `{toStem}_assets/...`
 * and copy the assets folder next to `pageAbs`.
 */
export async function placePdfAssetsBesidePage(opts: {
  pageAbs: string;
  markdown: string;
  fromStem: string;
  assetsDir: string | null;
  formulasManifestAbs: string | null;
}): Promise<string> {
  const pageStem = path.basename(opts.pageAbs, path.extname(opts.pageAbs));
  const destAssets = path.join(path.dirname(opts.pageAbs), `${pageStem}_assets`);
  let markdown = opts.markdown;

  if (opts.assetsDir && existsSync(opts.assetsDir)) {
    await rm(destAssets, { recursive: true, force: true }).catch(() => undefined);
    await cp(opts.assetsDir, destAssets, { recursive: true });
    const fromPrefix = `${opts.fromStem}_assets`;
    const toPrefix = `${pageStem}_assets`;
    if (fromPrefix !== toPrefix) {
      markdown = markdown.split(fromPrefix).join(toPrefix);
    }
  }

  if (opts.formulasManifestAbs && existsSync(opts.formulasManifestAbs)) {
    const destManifest = path.join(path.dirname(opts.pageAbs), `${pageStem}.formulas.json`);
    let raw = await readFile(opts.formulasManifestAbs, "utf8");
    try {
      const data = JSON.parse(raw) as {
        markdown?: string;
        formulas?: Array<{ image?: string; [k: string]: unknown }>;
      };
      data.markdown = path.basename(opts.pageAbs);
      if (Array.isArray(data.formulas)) {
        const fromPrefix = `${opts.fromStem}_assets`;
        const toPrefix = `${pageStem}_assets`;
        for (const entry of data.formulas) {
          if (typeof entry.image === "string" && fromPrefix !== toPrefix) {
            entry.image = entry.image.split(fromPrefix).join(toPrefix);
          }
        }
      }
      raw = `${JSON.stringify(data, null, 1)}\n`;
    } catch {
      /* keep original */
    }
    await writeFile(destManifest, raw, "utf8");
  }

  return markdown;
}

export function isPdfExtension(ext: string): boolean {
  return ext.toLowerCase() === ".pdf";
}

async function readConversionOutput(inputAbs: string, outDir: string): Promise<Pdf2mdLayoutResult> {
  const stem = path.basename(inputAbs, path.extname(inputAbs));
  const markdownAbs = path.join(outDir, `${stem}.md`);
  if (!existsSync(markdownAbs)) {
    // Fallback: pick the only .md in outDir (stem may differ after unusual names)
    const names = await readdir(outDir);
    const md = names.find((n) => n.toLowerCase().endsWith(".md"));
    if (!md) throw new Error("转换结果为空：未生成 Markdown");
    const abs = path.join(outDir, md);
    const actualStem = path.basename(md, ".md");
    const markdown = await readFile(abs, "utf8");
    if (!markdown.trim()) throw new Error("转换结果为空");
    const assetsDir = path.join(outDir, `${actualStem}_assets`);
    const formulasManifestAbs = path.join(outDir, `${actualStem}.formulas.json`);
    return {
      markdownAbs: abs,
      markdown,
      assetsDir: existsSync(assetsDir) ? assetsDir : null,
      formulasManifestAbs: existsSync(formulasManifestAbs) ? formulasManifestAbs : null,
      stem: actualStem,
    };
  }

  const markdown = await readFile(markdownAbs, "utf8");
  if (!markdown.trim()) throw new Error("转换结果为空");
  const assetsDir = path.join(outDir, `${stem}_assets`);
  const formulasManifestAbs = path.join(outDir, `${stem}.formulas.json`);
  return {
    markdownAbs,
    markdown,
    assetsDir: existsSync(assetsDir) ? assetsDir : null,
    formulasManifestAbs: existsSync(formulasManifestAbs) ? formulasManifestAbs : null,
    stem,
  };
}

function findPdf2mdScript(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const dir = path.dirname(currentFile);
  const candidates = [
    path.join(dir, "pdf2md", "pdf2md.py"),
    path.join(dir, "..", "pdf2md", "pdf2md.py"),
    path.join(dir, "..", "src", "pdf2md", "pdf2md.py"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("找不到 pdf2md.py，请检查安装包是否完整");
}
