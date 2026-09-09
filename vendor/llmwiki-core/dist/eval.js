/**
 * Health scorecard (differentiator B). Turns "is my wiki compounding?" from an
 * assertion into a number. Five normalized [0,1] metrics, combined as a geometric
 * mean so a genuinely broken dimension (e.g. 100% orphans) visibly tanks the
 * composite. Pure over pages + graph + a staleness count; the trend is what the
 * CLI's `health` surfaces over time.
 */
const SPECIAL_PAGE_IDS = new Set(["overview", "index", "log", "purpose"]);
export function scoreHealth(input) {
    const { pages, graph, staleCount = 0 } = input;
    const content = pages.filter((p) => p.fm && !SPECIAL_PAGE_IDS.has(p.id));
    const n = content.length;
    // coverage
    const seenTargets = new Set();
    let totalTargets = 0;
    let resolvedTargets = 0;
    for (const e of graph.edges) {
        if (seenTargets.has(e.target))
            continue;
        seenTargets.add(e.target);
        totalTargets++;
        if (graph.nodes.has(e.target))
            resolvedTargets++;
    }
    const coverage = totalTargets === 0 ? 1 : resolvedTargets / totalTargets;
    // citation density
    const meanCitations = n === 0 ? 0 : content.reduce((s, p) => s + (p.fm?.sources?.length ?? 0), 0) / n;
    const citationDensity = Math.min(1, meanCitations);
    // freshness
    const freshness = n === 0 ? 1 : 1 - Math.min(1, staleCount / n);
    // orphan rate
    const orphans = content.filter((p) => (graph.nodes.get(p.id)?.degree ?? 0) === 0).length;
    const orphanRate = n === 0 ? 1 : 1 - orphans / n;
    // connectivity (components among content pages only)
    const components = componentsAmong(content.map((p) => p.id), graph);
    const connectivity = n <= 1 ? 1 : 1 - (components - 1) / (n - 1);
    const composite = geometricMean([coverage, citationDensity, freshness, orphanRate, connectivity]);
    return { coverage, citationDensity, freshness, orphanRate, connectivity, composite };
}
function geometricMean(xs) {
    if (xs.length === 0)
        return 0;
    let product = 1;
    for (const x of xs)
        product *= Math.max(0, x);
    return product ** (1 / xs.length);
}
/** Count connected components among the given node ids, using graph edges between them. */
function componentsAmong(ids, graph) {
    const idSet = new Set(ids);
    const parent = new Map();
    const find = (x) => {
        let cur = x;
        while (parent.get(cur) !== cur) {
            const p = parent.get(cur);
            parent.set(cur, parent.get(p));
            cur = p;
        }
        return cur;
    };
    const union = (x, y) => {
        const rx = find(x);
        const ry = find(y);
        if (rx !== ry)
            parent.set(rx, ry);
    };
    for (const id of ids)
        parent.set(id, id);
    for (const e of graph.edges) {
        if (e.source === e.target)
            continue;
        if (idSet.has(e.source) && idSet.has(e.target))
            union(e.source, e.target);
    }
    const roots = new Set();
    for (const id of ids)
        roots.add(find(id));
    return roots.size;
}
//# sourceMappingURL=eval.js.map