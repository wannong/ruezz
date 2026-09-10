import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createBacklinksTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "get_backlinks",
    label: "获取反向链接",
    description: "获取指向某个页面的所有反向链接。",
    parameters: Type.Object({
      pageId: Type.String({ description: "目标页面 ID" }),
    }),
    async execute(toolCallId, params, signal) {
      const { pageId } = params as { pageId: string };
      const backlinks = await engine.backlinks(vaultRoot, pageId);
      
      const summary = backlinks.length > 0
        ? `[[${pageId}]] 有 ${backlinks.length} 个反向链接：\n${backlinks.map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}`
        : `[[${pageId}]] 没有反向链接。`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: { pageId, backlinks, count: backlinks.length },
      };
    },
  };
}
