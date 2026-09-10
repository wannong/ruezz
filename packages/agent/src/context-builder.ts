import type { GraphDto, PageContent, PageSummary, WikiEngine } from "@wikihome/engine-api";
import type { ContextBuildOptions } from "./types.js";

/**
 * Build context information for agent prompt:
 * - Current page content
 * - N-hop neighbor pages
 * - Search results (if query provided)
 */
export async function buildAgentContext(
  engine: WikiEngine,
  vaultRoot: string,
  options: ContextBuildOptions = {},
): Promise<string> {
  const { currentPageId, graphDepth = 1, searchQuery } = options;
  const parts: string[] = [];

  // 1. Current page context
  if (currentPageId) {
    try {
      const page = await engine.readPage(vaultRoot, currentPageId);
      if (page) {
        parts.push(`## 当前页面：[[${page.id}]]\n\n${page.body.slice(0, 2000)}`);
      }
    } catch {
      // Page might not exist, skip
    }
  }

  // 2. Neighbor pages (N-hop graph traversal)
  if (currentPageId && graphDepth > 0) {
    const neighbors = await collectNeighbors(engine, vaultRoot, currentPageId, graphDepth);
    if (neighbors.length > 0) {
      parts.push(
        `## 相关页面（${graphDepth} 跳邻居）\n\n${neighbors.map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}`,
      );
    }
  }

  // 3. Search results
  if (searchQuery) {
    try {
      const results = await engine.findPages(vaultRoot, searchQuery);
      if (results.length > 0) {
        parts.push(
          `## 搜索结果："${searchQuery}"\n\n${results.slice(0, 10).map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}`,
        );
      }
    } catch {
      // Search might fail, skip
    }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Collect N-hop neighbors using backlinks and forward links from graph.
 */
async function collectNeighbors(
  engine: WikiEngine,
  vaultRoot: string,
  pageId: string,
  maxDepth: number,
): Promise<PageSummary[]> {
  if (maxDepth <= 0) return [];

  const visited = new Set<string>([pageId]);
  const neighbors: PageSummary[] = [];
  let currentLevel = [pageId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevel: string[] = [];

    for (const id of currentLevel) {
      // Get backlinks
      try {
        const backlinks = await engine.backlinks(vaultRoot, id);
        for (const page of backlinks) {
          if (!visited.has(page.id)) {
            visited.add(page.id);
            neighbors.push(page);
            nextLevel.push(page.id);
          }
        }
      } catch {
        // Backlinks might fail, skip
      }

      // Get forward links from graph
      try {
        const graph = await engine.getGraph(vaultRoot);
        const edges = graph.edges.filter((e) => e.source === id);
        for (const edge of edges) {
          if (!visited.has(edge.target)) {
            const node = graph.nodes.find((n) => n.id === edge.target);
            if (node) {
              visited.add(edge.target);
              neighbors.push({
                id: edge.target,
                title: node.label,
                type: node.type,
              });
              nextLevel.push(edge.target);
            }
          }
        }
      } catch {
        // Graph might fail, skip
      }
    }

    currentLevel = nextLevel;
    if (currentLevel.length === 0) break;
  }

  return neighbors;
}
