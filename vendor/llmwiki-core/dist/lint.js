import { createPageResolver, extractWikilinks, normalizeLinkTarget } from "./graph.js";
import { sourceReferenceIdentity } from "./source-identity.js";
const SPECIAL_PAGE_IDS = new Set(["overview", "index", "log", "purpose"]);
const RESERVED_NAMES = new Set(["overview", "index", "log", "purpose"]);
const MIN_TAGS = 2;
/** Canonical content-type -> directory (singular frontmatter type to plural dir). */
const CANON_DIR = {
    entity: "entities",
    concept: "concepts",
    source: "sources",
    query: "queries",
    comparison: "comparisons",
    synthesis: "synthesis",
    archive: "archive",
};
function dirOf(id) {
    const i = id.lastIndexOf("/");
    return i >= 0 ? id.slice(0, i) : "";
}
const FOOTNOTE_DEF_RE = /^\[\^[^\]\s]+\]:\s*(.+?)\s*$/gm;
/** Extract source references from footnote definitions (`[^id]: <ref>, p. N`). */
export function extractFootnoteCitations(body) {
    const out = [];
    FOOTNOTE_DEF_RE.lastIndex = 0;
    let m;
    while ((m = FOOTNOTE_DEF_RE.exec(body)) !== null) {
        const ref = m[1]
            .split(/,\s*/)[0]
            .replace(/^\[\[|\]\]$/g, "")
            .replace(/^["']|["']$/g, "")
            .trim();
        if (ref)
            out.push(ref);
    }
    return out;
}
function normalizeId(id) {
    return id.toLowerCase().replace(/^wiki\//, "").replace(/\.md$/i, "");
}
function basename(p) {
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.slice(i + 1) : p;
}
function sourceBase(p) {
    return basename(p).replace(/\.md$/i, "");
}
export function lintPages(pages, sources, graph) {
    const issues = [];
    const knownPageIds = new Set(pages.map((p) => p.id));
    // normalized id -> canonical page id (first wins)
    const normalizedIndex = new Map();
    for (const p of pages) {
        const n = normalizeId(p.id);
        if (!normalizedIndex.has(n))
            normalizedIndex.set(n, p.id);
    }
    const sourceIds = new Set(sources.map((s) => s.id));
    const sourceBasenames = new Set(sources.map((s) => sourceBase(s.id)));
    const resolveLink = createPageResolver(pages);
    for (const p of pages) {
        if (!p.fm) {
            // Structural hub/ledger pages (purpose/index/log/overview) are authored
            // without content-page frontmatter; don't nag them for it.
            if (!SPECIAL_PAGE_IDS.has(p.id)) {
                issues.push({
                    pageId: p.id,
                    severity: "error",
                    rule: "missing-frontmatter",
                    message: `Page '${p.id}' has no frontmatter.`,
                    autoFixable: false,
                });
            }
            continue;
        }
        if (!p.fm.title?.trim()) {
            issues.push({
                pageId: p.id,
                severity: "error",
                rule: "missing-title",
                message: `Page '${p.id}' is missing a title.`,
                autoFixable: false,
            });
        }
        if ((p.fm.tags?.length ?? 0) < MIN_TAGS) {
            issues.push({
                pageId: p.id,
                severity: "warn",
                rule: "too-few-tags",
                message: `Page '${p.id}' has fewer than ${MIN_TAGS} tags.`,
                autoFixable: false,
            });
        }
        // Body wikilinks: exact (clean), trivially normalizable (auto-fixable),
        // fuzzy-resolvable by basename/title (fine, readable link), or truly broken.
        for (const target of extractWikilinks(p.body)) {
            if (knownPageIds.has(target))
                continue;
            const canonical = normalizedIndex.get(normalizeId(target));
            if (canonical && canonical !== target) {
                issues.push({
                    pageId: p.id,
                    severity: "warn",
                    rule: "link-normalizable",
                    message: `Link '[[${target}]]' should be '[[${canonical}]]'.`,
                    autoFixable: true,
                    fix: { kind: "rewrite-wikilink", oldTarget: target, newTarget: canonical },
                });
                continue;
            }
            if (resolveLink(target))
                continue; // fuzzy-resolvable (basename/title) — not broken
            issues.push({
                pageId: p.id,
                severity: "warn",
                rule: "broken-wikilink",
                message: `Link '[[${target}]]' points to no page.`,
                autoFixable: false,
            });
        }
        // related[] links: broken only when not resolvable (exact or fuzzy).
        for (const target of p.fm.related ?? []) {
            const normalized = normalizeLinkTarget(target);
            if (knownPageIds.has(normalized) || resolveLink(normalized))
                continue;
            issues.push({
                pageId: p.id,
                severity: "warn",
                rule: "broken-wikilink",
                message: `Related link '${target}' points to no page.`,
                autoFixable: false,
            });
        }
        for (const s of p.fm.sources ?? []) {
            const present = sourceIds.has(s) || sourceIds.has(sourceReferenceIdentity(s)) || sourceBasenames.has(sourceBase(s));
            if (!present) {
                issues.push({
                    pageId: p.id,
                    severity: "warn",
                    rule: "dangling-source",
                    message: `Source '${s}' is not present in raw/sources.`,
                    autoFixable: false,
                });
            }
        }
        // Footnote citations must be materialized as a `cites` edge, i.e. listed in
        // sources[]. A footnote whose target isn't in sources[] is a text/graph mismatch.
        const declaredSources = new Set((p.fm.sources ?? []).map((s) => sourceReferenceIdentity(s)));
        for (const citation of extractFootnoteCitations(p.body)) {
            if (!declaredSources.has(sourceReferenceIdentity(citation))) {
                issues.push({
                    pageId: p.id,
                    severity: "warn",
                    rule: "citation-graph-mismatch",
                    message: `Footnote cites '${citation}' but it is not in sources[] (no cites edge).`,
                    autoFixable: false,
                });
            }
        }
    }
    // Orphans: real pages with no connections (degree 0), excluding hub/ledger pages.
    for (const p of pages) {
        if (SPECIAL_PAGE_IDS.has(p.id) || p.fm?.type === "overview")
            continue;
        const node = graph.nodes.get(p.id);
        if (node && node.degree === 0) {
            issues.push({
                pageId: p.id,
                severity: "warn",
                rule: "orphan",
                message: `Page '${p.id}' has no connections to other pages.`,
                autoFixable: false,
            });
        }
    }
    // Path conventions & duplicates (content pages only).
    const contentPages = pages.filter((p) => p.fm && !SPECIAL_PAGE_IDS.has(p.id));
    const byKey = new Map();
    for (const p of contentPages) {
        const key = basename(p.id).toLowerCase().replace(/\.md$/i, "").replace(/\s+/g, "-");
        let arr = byKey.get(key);
        if (!arr) {
            arr = [];
            byKey.set(key, arr);
        }
        arr.push(p);
    }
    for (const group of byKey.values()) {
        if (group.length > 1) {
            for (const p of group) {
                issues.push({
                    pageId: p.id,
                    severity: "warn",
                    rule: "duplicate-page",
                    message: `Page '${p.id}' duplicates ${group.length - 1} other page(s) by name — consider merging.`,
                    autoFixable: false,
                });
            }
        }
    }
    for (const p of contentPages) {
        const dir = dirOf(p.id);
        const base = basename(p.id);
        const type = String(p.fm?.type ?? "concept");
        if (RESERVED_NAMES.has(base.toLowerCase()) && dir !== "") {
            issues.push({
                pageId: p.id,
                severity: "warn",
                rule: "reserved-path",
                message: `Page '${p.id}' uses reserved name '${base}' inside a directory; reserved names belong at the wiki root.`,
                autoFixable: false,
            });
            continue;
        }
        const canonical = CANON_DIR[type];
        if (!canonical) {
            if (!RESERVED_NAMES.has(type)) {
                issues.push({
                    pageId: p.id,
                    severity: "warn",
                    rule: "non-canonical-type",
                    message: `Page '${p.id}' has non-canonical type '${type}' (expected one of: ${[...Object.keys(CANON_DIR)].join(", ")}).`,
                    autoFixable: false,
                });
            }
        }
        else if (dir !== "" && dir !== canonical) {
            issues.push({
                pageId: p.id,
                severity: "warn",
                rule: "type-dir-mismatch",
                message: `Page '${p.id}' (type ${type}) should live in ${canonical}/.`,
                autoFixable: true,
                fix: { kind: "move-page", fromPath: p.path, toPath: `wiki/${canonical}/${base}.md` },
            });
        }
    }
    return issues;
}
/** Apply Tier-1 auto-fixable patches: rewrite normalizable wikilinks + relocate misplaced pages. */
export function applyLintFixes(pages, issues) {
    return pages.map((p) => {
        const moveFix = issues.find((i) => i.pageId === p.id && i.autoFixable && i.fix?.kind === "move-page")?.fix;
        const newPath = moveFix?.kind === "move-page" ? moveFix.toPath : p.path;
        const newId = newPath.replace(/^wiki\//, "").replace(/\.md$/i, "");
        const rewriteFixes = issues.filter((i) => i.pageId === p.id && i.autoFixable && i.fix?.kind === "rewrite-wikilink");
        if (!rewriteFixes.length && newPath === p.path)
            return p;
        const rewrite = (text) => text.replace(/\[\[([^\]\|]+)(\|[^\]]*)?\]\]/g, (match, target, alias) => {
            const f = rewriteFixes.find((x) => x.fix?.kind === "rewrite-wikilink" && x.fix.oldTarget === target);
            return f ? `[[${f.fix.newTarget}${alias ?? ""}]]` : match;
        });
        return {
            ...p,
            id: newId,
            path: newPath,
            body: rewriteFixes.length ? rewrite(p.body) : p.body,
            raw: rewriteFixes.length ? rewrite(p.raw) : p.raw,
        };
    });
}
//# sourceMappingURL=lint.js.map