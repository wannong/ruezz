import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import {
  convertPdfToTemp,
  isPdfExtension,
  placePdfAssetsBesidePage,
} from "@wikihome/engine-llmwiki";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveExistingInsideVault, toVaultRelative } from "./vault-path.js";

const PREVIEW_CHARS = 12_000;
const CONVERT_MS = 120_000;

export function createConvertToMarkdownTool(vaultRoot: string): AgentTool {
  return {
    name: "convert_to_markdown",
    label: "转为 Markdown",
    description:
      "把 vault 内的文档转成一篇 Markdown，写入 raw/sources/。PDF 走 pdf2md-layout（图/公式资源旁路保存）；Word / PPT / Excel / HTML 等走 MarkItDown。只转写、不拆页。ingest_file 遇到这些格式会自行转换；需要先预览转写结果时再用本工具。",
    parameters: Type.Object({
      filePath: Type.String({ description: "要转换的文件路径（相对于 vault root）" }),
    }),
    async execute(_toolCallId, params, signal) {
      const { filePath } = params as { filePath: string };
      const inputAbs = await resolveExistingInsideVault(vaultRoot, filePath);
      const info = await stat(inputAbs);
      if (!info.isFile()) {
        throw new Error(`不是文件：${filePath}`);
      }

      const outputAbs = defaultMarkdownOutput(vaultRoot, inputAbs);
      await mkdir(path.dirname(outputAbs), { recursive: true });

      const ext = path.extname(inputAbs);
      if (isPdfExtension(ext)) {
        await runPdf2md(inputAbs, outputAbs, signal);
      } else {
        await runMarkitdown(inputAbs, outputAbs, signal);
      }

      const markdown = await readFile(outputAbs, "utf8");
      if (!markdown.trim()) {
        throw new Error(`转换结果为空：${toVaultRelative(vaultRoot, outputAbs)}`);
      }

      const outputRel = toVaultRelative(vaultRoot, outputAbs);
      const truncated = markdown.length > PREVIEW_CHARS;
      const preview = truncated ? `${markdown.slice(0, PREVIEW_CHARS)}\n\n…（已截断预览）` : markdown;
      const summary = [
        `已转换为 Markdown：${outputRel}`,
        `源文件：${toVaultRelative(vaultRoot, inputAbs)}`,
        `引擎：${isPdfExtension(ext) ? "pdf2md-layout" : "MarkItDown"}`,
        `字符数：${markdown.length}`,
        "",
        preview,
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: { outputPath: outputRel, chars: markdown.length, truncated },
      };
    },
  };
}

function defaultMarkdownOutput(vaultRoot: string, inputAbs: string): string {
  const sources = path.join(path.resolve(vaultRoot), "raw", "sources");
  const base = path.basename(inputAbs);
  const stem = base.includes(".") ? base.replace(/\.[^.]+$/u, "") : base;
  const candidate = path.join(sources, `${stem || base}.md`);
  if (path.resolve(candidate) === path.resolve(inputAbs)) {
    return path.join(sources, `${base}.md`);
  }
  return candidate;
}

async function runPdf2md(inputAbs: string, outputAbs: string, signal?: AbortSignal): Promise<void> {
  const result = await convertPdfToTemp(inputAbs, signal);
  try {
    const rewritten = await placePdfAssetsBesidePage({
      pageAbs: outputAbs,
      markdown: result.markdown,
      fromStem: result.stem,
      assetsDir: result.assetsDir,
      formulasManifestAbs: result.formulasManifestAbs,
    });
    await writeFile(outputAbs, rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`, "utf8");
  } finally {
    await rm(result.cleanupDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function findBundledPython(): string | undefined {
  const exe = process.platform === "win32" ? "python.exe" : "python3";
  const seen = new Set<string>();
  const hits: string[] = [];
  const add = (candidate: string) => {
    const abs = path.resolve(candidate);
    const key = abs.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(abs);
  };
  const execDir = path.dirname(process.execPath);
  add(path.join(execDir, "python", exe));
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    add(path.join(dir, "python", exe));
    add(path.join(dir, "runtime", "python", exe));
    add(path.join(dir, "resources", "runtime", "python", exe));
    add(path.join(dir, "apps", "desktop", "src-tauri", "resources", "runtime", "python", exe));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return hits.find((file) => existsSync(file));
}

function pythonCandidates(): string[] {
  const bins: string[] = [];
  const fromEnv = process.env.WIKIHOME_PYTHON?.trim();
  if (fromEnv) bins.push(fromEnv);
  const bundled = findBundledPython();
  if (bundled) bins.push(bundled);
  if (process.platform === "win32") bins.push("python", "py");
  else bins.push("python3", "python");
  return [...new Set(bins)];
}

function isPyLauncher(bin: string): boolean {
  return /^(?:py|py\.exe)$/i.test(path.basename(bin));
}

async function runMarkitdown(inputAbs: string, outputAbs: string, signal?: AbortSignal): Promise<void> {
  const args = [inputAbs, "-o", outputAbs];
  const bins = pythonCandidates();

  let lastError = "";
  for (const bin of bins) {
    const moduleArgs = isPyLauncher(bin)
      ? ["-3", "-m", "markitdown", ...args]
      : ["-m", "markitdown", ...args];
    try {
      const result = await spawnOnce(bin, moduleArgs, signal, CONVERT_MS);
      if (result.code === 0) return;
      lastError = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      if (/no module named markitdown/i.test(lastError)) {
        continue;
      }
      continue;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/aborted|timeout/i.test(message)) {
        throw new Error("转换已取消或超时");
      }
      if (/ENOENT/i.test(message)) {
        lastError = `找不到 ${bin}`;
        continue;
      }
      throw err instanceof Error ? err : new Error(message);
    }
  }
  throw new Error(
    `MarkItDown 转换失败：${lastError || "未找到 Python"}。请关掉 WikiHome 后用带 resources\\runtime\\python 的绿色包打开，不要只拷贝 WikiHome.exe。`,
  );
}

function spawnEnv(command: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PYTHONNOUSERSITE: "1",
  };
  delete env.PYTHONPATH;
  if (path.isAbsolute(command) && /python(?:\.exe)?$/i.test(command) && !isPyLauncher(command)) {
    env.PYTHONHOME = path.dirname(command);
  } else {
    delete env.PYTHONHOME;
  }
  return env;
}

function spawnOnce(
  command: string,
  args: string[],
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: spawnEnv(command),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("timeout")));
    }, timeoutMs);
    const onAbort = () => {
      child.kill();
      finish(() => reject(new Error("aborted")));
    };
    if (signal?.aborted) {
      child.kill();
      finish(() => reject(new Error("aborted")));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      finish(() => reject(err));
    });
    child.on("close", (code) => {
      finish(() => resolve({ stdout, stderr, code }));
    });
  });
}
