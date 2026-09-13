import path from "node:path";
import { promises as fs } from "node:fs";

export function resolveInsideVault(vaultRoot: string, filePath: string): string {
  const vaultResolved = path.resolve(vaultRoot);
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(vaultRoot, filePath);
  const rel = path.relative(vaultResolved, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`路径必须在 vault 内：${filePath}`);
  }
  return resolved;
}

export async function resolveExistingInsideVault(vaultRoot: string, filePath: string): Promise<string> {
  const resolved = resolveInsideVault(vaultRoot, filePath);
  const [realVault, realFile] = await Promise.all([fs.realpath(vaultRoot), fs.realpath(resolved)]);
  const rel = path.relative(realVault, realFile);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`路径通过链接越出了 vault：${filePath}`);
  }
  return realFile;
}

export function toVaultRelative(vaultRoot: string, absPath: string): string {
  return path.relative(path.resolve(vaultRoot), absPath).split(path.sep).join("/");
}

export function isInsideDir(vaultRoot: string, absPath: string, relDir: string): boolean {
  const dir = path.resolve(vaultRoot, relDir);
  const rel = path.relative(dir, absPath);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}
