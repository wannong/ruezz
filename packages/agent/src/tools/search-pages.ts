import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createSearchPagesTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "search_pages",
    label: "搜索页面",
    description: "在知识库中搜索页面。返回匹配的页面列表。",
    parameters: Type.Object({
      query: Type.String({ description: "搜索关键词" }),
    }),
    async execute(toolCallId, params, signal) {
      const { query } = params as { query: string };
      const results = await engine.findPages(vaultRoot, query);
      
      const summary = results.length > 0
        ? `找到 ${results.length} 个相关页面：\n${results.map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}`
        : "未找到匹配的页面。";
      
      return {
        content: [{ type: "text", text: summary }],
        details: { results, count: results.length },
      };
    },
  };
}
