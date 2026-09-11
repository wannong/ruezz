import { spawn } from "node:child_process";
import path from "node:path";

export const CONVERT_MS = 120_000;

export const CONVERTIBLE_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".xlsx",
  ".xls",
  ".html",
  ".htm",
]);

export function isConvertibleExtension(ext: string): boolean {
  return CONVERTIBLE_EXTENSIONS.has(ext.toLowerCase());
}

export function pythonCandidates(): string[] {
  const fromEnv = process.env.WIKIHOME_PYTHON?.trim();
  const bins: string[] = [];
  if (fromEnv) bins.push(fromEnv);
  if (process.platform === "win32") bins.push("python", "py");
  else bins.push("python3", "python");
  return [...new Set(bins)];
}

export function defaultMarkdownOutput(vaultRoot: string, inputAbs: string): string {
  const sources = path.join(path.resolve(vaultRoot), "raw", "sources");
  const base = path.basename(inputAbs);
  const stem = base.includes(".") ? base.replace(/\.[^.]+$/u, "") : base;
  const candidate = path.join(sources, `${stem || base}.md`);
  if (path.resolve(candidate) === path.resolve(inputAbs)) {
    return path.join(sources, `${base}.md`);
  }
  return candidate;
}

export async function convertFileToMarkdown(
  inputAbs: string,
  outputAbs: string,
  signal?: AbortSignal,
): Promise<void> {
  const args = [inputAbs, "-o", outputAbs];
  let lastError = "";
  for (const bin of pythonCandidates()) {
    const moduleArgs = isPyLauncher(bin) ? ["-3", "-m", "markitdown", ...args] : ["-m", "markitdown", ...args];
    try {
      const result = await spawnOnce(bin, moduleArgs, signal, CONVERT_MS);
      if (result.code === 0) return;
      lastError = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      if (/no module named markitdown/i.test(lastError)) {
        throw new Error(
          '未安装 Python 包 markitdown。请运行：python -m pip install "markitdown[pdf,docx,pptx,xlsx]"',
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

function isPyLauncher(bin: string): boolean {
  return /^(?:py|py\.exe)$/i.test(path.basename(bin));
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
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONNOUSERSITE: "1" },
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
