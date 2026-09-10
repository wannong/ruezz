import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createCreatePageTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "create_page",
    label: "创建页面",
    description: "创建新页面。路径必须在 wiki/ 目录内。",
    parameters: Type.Object({
      id: Type.String({ description: "新页面的 ID 或路径（例如：notes/new-idea）" }),
      title: Type.Optional(Type.String({ description: "页面标题（可选）" })),
    }),
    async execute(toolCallId, params, signal) {
      const { id, title } = params as { id: string; title?: string };
      
      // Security: engine already enforces wiki/ traversal guard
      const page = await engine.createPage(vaultRoot, id, title);
      
      return {
        content: [{ type: "text", text: `已创建页面 [[${page.id}]]` }],
        details: { pageId: page.id, path: page.path, title: page.title },
      };
    },
  };
}
