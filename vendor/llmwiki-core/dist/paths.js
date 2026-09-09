/** Normalize a filesystem path to a consistent forward-slash form. Case-preserving. */
export function normalizePath(p) {
    let s = p.trim().replace(/\\/g, "/");
    // Collapse repeated slashes (keep a single leading slash if present).
    const leadingSlash = s.startsWith("/") ? "/" : "";
    s = s.replace(/\/+/g, "/").replace(/^\//, "");
    if (leadingSlash)
        s = leadingSlash + s;
    // Strip a trailing slash unless the whole path is the root.
    if (s.length > 1 && s.endsWith("/"))
        s = s.replace(/\/+$/, "");
    return s;
}
/** Return the final path segment (the file name). */
export function getFileName(p) {
    const n = normalizePath(p);
    const idx = n.lastIndexOf("/");
    return idx < 0 ? n : n.slice(idx + 1);
}
//# sourceMappingURL=paths.js.map