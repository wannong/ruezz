/**
 * Derive the canonical identity of a source file from its path, relative to the
 * `raw/sources/` root. Marker location is case-insensitive; the returned identity
 * preserves the original case of the path.
 */
export declare function sourceIdentityForPath(projectPath: string, sourcePath: string): string;
/**
 * Normalize a source reference (as written inside a page, e.g. a footnote target)
 * to the same identity space as {@link sourceIdentityForPath}.
 */
export declare function sourceReferenceIdentity(sourceReference: string): string;
/**
 * Build a deterministic, collision-resistant slug for a source's generated wiki
 * page. Multi-segment identities become `len-part--len-part--…--<hash>`; the hash
 * is the FNV-1a of the full identity so the slug is stable across renames of the
 * readable parts.
 */
export declare function sourceSummarySlugFromIdentity(sourceIdentity: string): string;
/** FNV-1a 32-bit hash, returned in base36. Deterministic across platforms. */
export declare function stableSlugHash(value: string): string;
//# sourceMappingURL=source-identity.d.ts.map