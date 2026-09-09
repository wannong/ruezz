/** Dangling link targets aggregated into proposed-page candidates (most-referenced first). */
export function findKnowledgeGaps(graph) {
    const refBy = new Map();
    for (const e of graph.edges) {
        if (graph.nodes.has(e.target))
            continue; // only dangling targets
        if (e.source === e.target)
            continue;
        let set = refBy.get(e.target);
        if (!set) {
            set = new Set();
            refBy.set(e.target, set);
        }
        set.add(e.source);
    }
    return [...refBy.entries()]
        .map(([target, refs]) => ({ target, referencedBy: [...refs] }))
        .sort((a, b) => b.referencedBy.length - a.referencedBy.length);
}
/** High-degree nodes (hubs), descending by degree. */
export function findHubs(graph, minDegree = 3) {
    return [...graph.nodes.values()]
        .filter((n) => n.degree >= minDegree)
        .sort((a, b) => b.degree - a.degree);
}
/** Connected components of the (undirected) link graph, each a list of node ids. */
export function connectedComponents(graph) {
    const parent = new Map();
    const find = (x) => {
        let cur = x;
        while (parent.get(cur) !== cur) {
            const p = parent.get(cur);
            parent.set(cur, parent.get(p)); // path compression
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
    for (const id of graph.nodes.keys())
        parent.set(id, id);
    for (const e of graph.edges) {
        if (e.source === e.target)
            continue;
        if (!graph.nodes.has(e.source) || !graph.nodes.has(e.target))
            continue;
        union(e.source, e.target);
    }
    const groups = new Map();
    for (const id of graph.nodes.keys()) {
        const root = find(id);
        const arr = groups.get(root);
        if (arr)
            arr.push(id);
        else
            groups.set(root, [id]);
    }
    return [...groups.values()];
}
//# sourceMappingURL=graph-insights.js.map