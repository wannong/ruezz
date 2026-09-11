/**
 * Delete a directory tree without following Windows junctions / symlinks.
 * robocopy /MIR is unsafe here: it mirrors into junction targets (the monorepo).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
if (!root || root.length < 8) {
  console.error("usage: node rm-tree.mjs <dir>");
  process.exit(1);
}

function rmSafe(target) {
  let st;
  try {
    st = fs.lstatSync(target);
  } catch {
    return;
  }
  if (st.isSymbolicLink()) {
    fs.rmSync(target, { force: true });
    return;
  }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(target)) {
      rmSafe(path.join(target, name));
    }
    fs.rmSync(target, { recursive: true, force: true });
    return;
  }
  fs.rmSync(target, { force: true });
}

if (fs.existsSync(root) || fs.lstatSync(root, { throwIfNoEntry: false })) {
  rmSafe(root);
}
