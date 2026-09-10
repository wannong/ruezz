import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createWritePageTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "write_page",
    label: "写入页面",
    description: "写入或更新页面内容。页面必须已存在。路径必须在 wiki/ 目录内。",
    parameters: Type.Object({
      id: Type.String({ description: "页面 ID 或路径" }),
      content: Type.String({ description: "页面的原始 Markdown 内容（包括 frontmatter）" }),
    }),
    async execute(toolCallId, params, signal) {
      const { id, content } = params as { id: string; content: string };
      
      // Security: engine already enforces wiki/ traversal guard
      const page = await engine.writePage(vaultRoot, id, content);
      
      return {
        content: [{ type: "text", text: `已更新页面 [[${page.id}]]` }],
        details: { pageId: page.id, path: page.path },
      };
    },
  };
}
