import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveInsideVault, toVaultRelative } from "./vault-path.js";

const PREVIEW_CHARS = 12_000;
const CONVERT_MS = 120_000;

export function createConvertToMarkdownTool(vaultRoot: string): AgentTool {
  return {
    name: "convert_to_markdown",
    label: "转为 Markdown",
    description:
      "用 MarkItDown 把 vault 内的 PDF / Word / PPT / Excel / HTML 等转为 Markdown，并写入 raw/sources/。二进制文档入库前应先调用此工具。",
    parameters: Type.Object({
      filePath: Type.String({ description: "要转换的文件路径（相对于 vault root）" }),
    }),
    async execute(_toolCallId, params, signal) {
      const { filePath } = params as { filePath: string };
      const inputAbs = resolveInsideVault(vaultRoot, filePath);
      const info = await stat(inputAbs);
      if (!info.isFile()) {
        throw new Error(`不是文件：${filePath}`);
      }

      const outputAbs = defaultMarkdownOutput(vaultRoot, inputAbs);
      await mkdir(path.dirname(outputAbs), { recursive: true });

      await runMarkitdown(inputAbs, outputAbs, signal);

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

async function runMarkitdown(inputAbs: string, outputAbs: string, signal?: AbortSignal): Promise<void> {
  const args = [inputAbs, "-o", outputAbs];
  const bins = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];

  let lastError = "";
  for (const bin of bins) {
    const moduleArgs = bin === "py" ? ["-3", "-m", "markitdown", ...args] : ["-m", "markitdown", ...args];
    try {
      const result = await spawnOnce(bin, moduleArgs, signal, CONVERT_MS);
      if (result.code === 0) return;
      lastError = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      if (/no module named markitdown/i.test(lastError)) {
        throw new Error(
          "未安装 Python 包 markitdown。请运行：python -m pip install \"markitdown[pdf,docx,pptx,xlsx]\"",
        );
      }
      throw new Error(`MarkItDown 转换失败：${lastError}`);
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
  throw new Error(`MarkItDown 转换失败：${lastError || "未找到 Python"}`);
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
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
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
