import path from "node:path";

/** True when `file` resolves to a path strictly inside `dir` (not equal to `dir`). */
export function isStrictlyInsideDir(dir: string, file: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** True when `file` resolves to `dir` itself or a path inside `dir`. */
export function isInsideOrEqualDir(dir: string, file: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
