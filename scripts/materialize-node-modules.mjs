/**
 * Replace Windows junctions / symlinks under a pnpm-deploy tree with real files.
 * Tauri's resource glob and NSIS cannot keep absolute junction targets.
 *
 * Links that point at the workspace are copied via package.json "files"
 * (never node_modules) so we do not pull in the monorepo.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
if (!root || !fs.existsSync(root)) {
  console.error("usage: node materialize-node-modules.mjs <dir>");
  process.exit(1);
}
const rootReal = fs.realpathSync.native(root);

function collectLinks(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      out.push(full);
      continue;
    }
    if (entry.isDirectory()) collectLinks(full, out);
  }
}

function copyPlain(src, dst) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === "node_modules") continue;
      copyPlain(path.join(src, name), path.join(dst, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyWorkspacePackage(src, dst) {
  const pkgFile = path.join(src, "package.json");
  if (!fs.existsSync(pkgFile)) {
    throw new Error(`escaped link is not a package: ${src}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  const allow = Array.isArray(pkg.files) && pkg.files.length > 0 ? pkg.files : ["dist"];
  fs.mkdirSync(dst, { recursive: true });
  fs.copyFileSync(pkgFile, path.join(dst, "package.json"));
  for (const extra of ["README.md", "LICENSE", "LICENSE.md"]) {
    const p = path.join(src, extra);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dst, extra));
  }
  for (const rel of allow) {
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) continue;
    copyPlain(from, path.join(dst, rel));
  }
}

const links = [];
collectLinks(root, links);
links.sort((a, b) => b.length - a.length);

let converted = 0;
let dropped = 0;
for (const link of links) {
  let st;
  try {
    st = fs.lstatSync(link);
  } catch {
    continue;
  }
  if (!st.isSymbolicLink()) continue;

  let target;
  try {
    target = fs.realpathSync.native(link);
  } catch {
    fs.rmSync(link, { recursive: true, force: true });
    dropped += 1;
    continue;
  }
  const targetReal = path.resolve(target);
  const rel = path.relative(rootReal, targetReal);
  const escaped = rel.startsWith("..") || path.isAbsolute(rel);

  const tmp = `${link}.__materialize`;
  fs.rmSync(tmp, { recursive: true, force: true });
  if (escaped) {
    const name = path.basename(link);
    if (name === "sidecar") {
      fs.rmSync(link, { recursive: true, force: true });
      dropped += 1;
      continue;
    }
    copyWorkspacePackage(targetReal, tmp);
  } else {
    copyPlain(targetReal, tmp);
  }
  fs.rmSync(link, { recursive: true, force: true });
  let renamed = false;
  for (let i = 0; i < 12; i++) {
    try {
      fs.renameSync(tmp, link);
      renamed = true;
      break;
    } catch (err) {
      if (i === 11) {
        copyPlain(tmp, link);
        fs.rmSync(tmp, { recursive: true, force: true });
        renamed = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (i + 1));
    }
  }
  if (!renamed) throw new Error(`could not replace ${link}`);
  converted += 1;
}

console.log(`materialized ${converted} reparse points, dropped ${dropped} under ${root}`);
