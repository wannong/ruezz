import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function revealInExplorer(target: string): Promise<void> {
  const abs = path.resolve(target);
  let isFile = false;
  try {
    isFile = (await fs.stat(abs)).isFile();
  } catch {
    /* missing path: open parent if possible */
  }

  if (process.platform === "win32") {
    // `/select,` must stay a separate argv so paths with spaces still work.
    const args = isFile ? ["/select,", abs] : [abs];
    const child = spawn("explorer.exe", args, {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: true,
    });
    child.unref();
    return;
  }
  if (process.platform === "darwin") {
    const args = isFile ? ["-R", abs] : [abs];
    const child = spawn("open", args, { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  const child = spawn("xdg-open", [isFile ? path.dirname(abs) : abs], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
