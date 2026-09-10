import type { GraphDto, PageContent, PageSummary, WikiEngine } from "@wikihome/engine-api";
import type { ContextBuildOptions } from "./types.js";

/**
 * Build context information for agent prompt:
 * - Current page content
 * - N-hop neighbor pages
 * - Search results (if query provided)
 * 
 * Total context is trimmed to stay within character budget (approx 10k chars = ~2.5k tokens).
 */
export async function buildAgentContext(
  engine: WikiEngine,
  vaultRoot: string,
  options: ContextBuildOptions = {},
): Promise<string> {
  const { currentPageId, graphDepth = 1, searchQuery } = options;
  const MAX_CONTEXT_CHARS = 10000; // Approx 2.5k tokens
  const parts: string[] = [];
  let totalChars = 0;

  // 1. Current page context (prioritize this, allow up to 4k chars)
  if (currentPageId) {
    try {
      const page = await engine.readPage(vaultRoot, currentPageId);
      if (page) {
        const pageContent = `## 当前页面：[[${page.id}]]\n\n${page.body}`;
        const trimmed = pageContent.slice(0, 4000);
        parts.push(trimmed);
        totalChars += trimmed.length;
      }
    } catch {
      // Page might not exist, skip
    }
  }

  // 2. Neighbor pages (N-hop graph traversal)
  if (currentPageId && graphDepth > 0 && totalChars < MAX_CONTEXT_CHARS) {
    const neighbors = await collectNeighbors(engine, vaultRoot, currentPageId, graphDepth);
    if (neighbors.length > 0) {
      const neighborSection = `## 相关页面（${graphDepth} 跳邻居）\n\n${neighbors.map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}`;
      const available = MAX_CONTEXT_CHARS - totalChars;
      const trimmed = neighborSection.slice(0, available);
      parts.push(trimmed);
      totalChars += trimmed.length;
    }
  }

  // 3. Search results
  if (searchQuery && totalChars < MAX_CONTEXT_CHARS) {
    try {
      const results = await engine.findPages(vaultRoot, searchQuery);
      if (results.length > 0) {
        const searchSection = `## 搜索结果："${searchQuery}"\n\n${results.slice(0, 10).map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}`;
        const available = MAX_CONTEXT_CHARS - totalChars;
        const trimmed = searchSection.slice(0, available);
        parts.push(trimmed);
        totalChars += trimmed.length;
      }
    } catch {
      // Search might fail, skip
    }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Collect N-hop neighbors using backlinks and forward links from graph.
 * Fetches graph only once.
 */
async function collectNeighbors(
  engine: WikiEngine,
  vaultRoot: string,
  pageId: string,
  maxDepth: number,
): Promise<PageSummary[]> {
  if (maxDepth <= 0) return [];

  // Fetch graph once at the start
  let graph: GraphDto | null = null;
  try {
    graph = await engine.getGraph(vaultRoot);
  } catch {
    // Graph unavailable, skip
    return [];
  }

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

      // Get forward links from graph (already fetched)
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
    }

    currentLevel = nextLevel;
    if (currentLevel.length === 0) break;
  }

  return neighbors;
}
