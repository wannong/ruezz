import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function pythonExeName(): string {
  return process.platform === "win32" ? "python.exe" : "python3";
}

/** WikiHome-bundled CPython with MarkItDown, next to the sidecar/runtime. */
export function findBundledPython(): string | undefined {
  const exe = pythonExeName();
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
  add(path.join(execDir, exe));

  const starts = [process.cwd(), execDir];
  try {
    starts.push(path.dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled without import.meta.url */
  }
  if (process.env.WIKIHOME_PYTHON?.trim()) {
    starts.push(path.dirname(process.env.WIKIHOME_PYTHON.trim()));
  }

  for (const start of starts) {
    let dir = path.resolve(start);
    for (let i = 0; i < 12; i += 1) {
      add(path.join(dir, "python", exe));
      add(path.join(dir, "runtime", "python", exe));
      add(path.join(dir, "resources", "runtime", "python", exe));
      add(path.join(dir, "apps", "desktop", "src-tauri", "resources", "runtime", "python", exe));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return hits.find((file) => existsSync(file));
}

export function pythonCandidates(): string[] {
  const bins: string[] = [];
  const fromEnv = process.env.WIKIHOME_PYTHON?.trim();
  if (fromEnv) bins.push(fromEnv);
  const bundled = findBundledPython();
  if (bundled) bins.push(bundled);
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
  let sawMissingModule = false;
  for (const bin of pythonCandidates()) {
    const moduleArgs = isPyLauncher(bin) ? ["-3", "-m", "markitdown", ...args] : ["-m", "markitdown", ...args];
    try {
      const result = await spawnOnce(bin, moduleArgs, signal, CONVERT_MS);
      if (result.code === 0) return;
      lastError = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      if (/no module named markitdown/i.test(lastError)) {
        sawMissingModule = true;
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
      lastError = message;
    }
  }
  if (sawMissingModule) {
    throw new Error(
      "未找到带 MarkItDown 的 Python。请关掉 WikiHome 后用带 resources\\runtime\\python 的绿色包或安装包打开，不要只拷贝 WikiHome.exe。",
    );
  }
  throw new Error(`MarkItDown 转换失败：${lastError || "未找到 Python"}`);
}

function isPyLauncher(bin: string): boolean {
  return /^(?:py|py\.exe)$/i.test(path.basename(bin));
}

function spawnEnv(command: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PYTHONNOUSERSITE: "1",
  };
  delete env.PYTHONPATH;
  const abs = path.isAbsolute(command);
  if (abs && /python(?:\.exe)?$/i.test(command) && !isPyLauncher(command)) {
    env.PYTHONHOME = path.dirname(command);
  } else {
    delete env.PYTHONHOME;
  }
  return env;
}

export function spawnOnce(
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
