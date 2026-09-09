export function planMaintenance(input) {
    const maxPropose = input.maxPropose ?? 5;
    const tasks = [];
    for (const id of input.stalePageIds) {
        tasks.push({ kind: "resynthesize", pageId: id, detail: `Re-synthesize stale page '${id}' from its sources.` });
    }
    for (const gap of input.gaps.slice(0, maxPropose)) {
        tasks.push({
            kind: "propose",
            target: gap.target,
            detail: `Create a page for '${gap.target}', referenced by ${gap.referencedBy.join(", ")}.`,
        });
    }
    for (const issue of input.lintIssues) {
        if (issue.autoFixable)
            continue; // those are fixed by `lint --fix`, not maintenance
        tasks.push({
            kind: "review",
            pageId: issue.pageId,
            detail: `[${issue.severity}] ${issue.rule}: ${issue.message}`,
        });
    }
    const counts = {
        resynthesize: tasks.filter((t) => t.kind === "resynthesize").length,
        propose: tasks.filter((t) => t.kind === "propose").length,
        review: tasks.filter((t) => t.kind === "review").length,
    };
    return { tasks, counts };
}
/** Prompt the model to draft a stub page for a missing concept (a knowledge gap). */
export function buildProposePrompt(gap, neighborSnippets) {
    const slug = gap.target
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    const fileDir = gap.target.includes("/") ? `wiki/${gap.target.replace(/\.md$/i, "")}` : `wiki/concepts/${slug}`;
    return [
        `A page for '${gap.target}' is referenced by ${gap.referencedBy.length} page(s) but does not exist.`,
        `Draft a concise stub page so the wiki has no dangling link.`,
        ``,
        `## Context from pages that reference it`,
        neighborSnippets.trim() || "(no snippets available)",
        ``,
        `## Output format (emit ONLY this block)`,
        `---FILE: ${fileDir}.md---`,
        `<YAML frontmatter: type: concept, title: "${gap.target}", tags (>=2), related, sources, created, updated, confidence: INFERRED>`,
        `<short markdown body with [[wikilinks]]>`,
        `---END FILE---`,
        ``,
        `Path conventions: lowercase-kebab-case slug (no spaces); never touch wiki/purpose.md,`,
        `wiki/overview.md, wiki/index.md, or wiki/log.md (reserved).`,
    ].join("\n");
}
/** Prompt the model to refresh a stale page from its sources. */
export function buildRefreshPrompt(pageId, currentBody, sourceSnippets) {
    return [
        `Refresh the wiki page '${pageId}' — it is stale (something it depends on changed).`,
        `Rewrite it using the source material below, keeping it consistent with the rest of the wiki.`,
        `Do NOT restate these instructions; emit only the page.`,
        ``,
        `## Current page body`,
        currentBody.trim() || "(empty)",
        ``,
        `## Source material`,
        sourceSnippets.trim() || "(no sources available — refresh from general knowledge of the topic)",
        ``,
        `## Output format (emit ONLY this block)`,
        `---FILE: ${pageId}.md---`,
        `<full page with YAML frontmatter and markdown body>`,
        `---END FILE---`,
    ].join("\n");
}
//# sourceMappingURL=maintain.js.map