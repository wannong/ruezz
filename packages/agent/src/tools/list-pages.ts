import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createListPagesTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "list_pages",
    label: "列出所有页面",
    description: "列出知识库中的所有页面。",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal) {
      const pages = await engine.listPages(vaultRoot);
      
      const summary = `知识库共有 ${pages.length} 个页面：\n${pages.slice(0, 20).map((p) => `- [[${p.id}]] ${p.title || ""}`).join("\n")}${pages.length > 20 ? `\n...（共 ${pages.length} 个）` : ""}`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: { count: pages.length, sampleIds: pages.slice(0, 50).map((p) => p.id) },
      };
    },
  };
}
