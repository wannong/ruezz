import { getFileName, normalizePath } from "./paths.js";
/**
 * Stable identity for a raw source, decoupled from its filename.
 *
 * A source can be moved or renamed without breaking the wiki's citation graph,
 * because pages store this identity (a path under `raw/sources/...`) rather than
 * the literal filename. A short FNV-1a hash is folded into the generated summary
 * slug so two sources with similar names never collide.
 */
const RAW_SOURCES_PREFIX = "raw/sources/";
const RAW_SOURCES_MARKER = "/raw/sources/";
const MAX_SOURCE_SUMMARY_SLUG_LENGTH = 120;
const FALLBACK_SOURCE_PART = "source";
/**
 * Derive the canonical identity of a source file from its path, relative to the
 * `raw/sources/` root. Marker location is case-insensitive; the returned identity
 * preserves the original case of the path.
 */
export function sourceIdentityForPath(projectPath, sourcePath) {
    const pp = normalizePath(projectPath).replace(/\/+$/, "");
    const sp = normalizePath(sourcePath);
    const projectRawSourcesPrefix = `${pp}/${RAW_SOURCES_PREFIX}`;
    const spKey = sp.toLowerCase();
    if (spKey.startsWith(projectRawSourcesPrefix.toLowerCase())) {
        return sp.slice(projectRawSourcesPrefix.length);
    }
    if (spKey.startsWith(RAW_SOURCES_PREFIX)) {
        return sp.slice(RAW_SOURCES_PREFIX.length);
    }
    const markerIndex = spKey.indexOf(RAW_SOURCES_MARKER);
    if (markerIndex >= 0) {
        return sp.slice(markerIndex + RAW_SOURCES_MARKER.length);
    }
    return getFileName(sp);
}
/**
 * Normalize a source reference (as written inside a page, e.g. a footnote target)
 * to the same identity space as {@link sourceIdentityForPath}.
 */
export function sourceReferenceIdentity(sourceReference) {
    const ref = normalizePath(sourceReference);
    const refKey = ref.toLowerCase();
    if (refKey.startsWith(RAW_SOURCES_PREFIX)) {
        return ref.slice(RAW_SOURCES_PREFIX.length);
    }
    const markerIndex = refKey.indexOf(RAW_SOURCES_MARKER);
    if (markerIndex >= 0) {
        return ref.slice(markerIndex + RAW_SOURCES_MARKER.length);
    }
    return ref;
}
/**
 * Build a deterministic, collision-resistant slug for a source's generated wiki
 * page. Multi-segment identities become `len-part--len-part--…--<hash>`; the hash
 * is the FNV-1a of the full identity so the slug is stable across renames of the
 * readable parts.
 */
export function sourceSummarySlugFromIdentity(sourceIdentity) {
    const withoutExt = sourceIdentity.replace(/\.[^/.]+$/, "");
    const parts = withoutExt
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length <= 1) {
        return parts[0] || FALLBACK_SOURCE_PART;
    }
    const hash = stableSlugHash(sourceIdentity);
    const slug = parts
        .map((part) => {
        const { readable, structuralLength } = readableSlugPart(part);
        return `${structuralLength}-${readable}`;
    })
        .join("--");
    const fullSlug = `${slug}--${hash}`;
    if (fullSlug.length <= MAX_SOURCE_SUMMARY_SLUG_LENGTH) {
        return fullSlug;
    }
    const readableLimit = MAX_SOURCE_SUMMARY_SLUG_LENGTH - hash.length - 2;
    const readablePrefix = slug.slice(0, readableLimit).replace(/-+$/, "");
    return `${readablePrefix || FALLBACK_SOURCE_PART}--${hash}`;
}
/** FNV-1a 32-bit hash, returned in base36. Deterministic across platforms. */
export function stableSlugHash(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function readableSlugPart(part) {
    const structural = part
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}-]/gu, "")
        .replace(/^-|-$/g, "")
        .toLowerCase();
    const readable = structural.replace(/-+/g, "-") || FALLBACK_SOURCE_PART;
    return {
        readable,
        structuralLength: Math.max(1, Array.from(structural || FALLBACK_SOURCE_PART).length),
    };
}
//# sourceMappingURL=source-identity.js.map