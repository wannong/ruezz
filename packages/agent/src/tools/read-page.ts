import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createReadPageTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "read_page",
    label: "读取页面",
    description: "读取指定 ID 或路径的页面内容。",
    parameters: Type.Object({
      id: Type.String({ description: "页面 ID 或路径" }),
    }),
    async execute(toolCallId, params, signal) {
      const { id } = params as { id: string };
      const page = await engine.readPage(vaultRoot, id);
      
      if (!page) {
        throw new Error(`页面不存在：${id}`);
      }
      
      const summary = `# ${page.title || page.id}\n\n${page.body}`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: { pageId: page.id, path: page.path, title: page.title },
      };
    },
  };
}
