import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createCreatePageTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "create_page",
    label: "创建页面",
    description:
      "创建新页面。路径必须在 wiki/ 目录内。若内容派生自某个资料，请传 sources（raw/ 原件路径），会在 frontmatter 写入 sources 使图谱链接到原件。",
    parameters: Type.Object({
      id: Type.String({ description: "新页面的 ID 或路径（例如：notes/new-idea）" }),
      title: Type.Optional(Type.String({ description: "页面标题（可选）" })),
      sources: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "来源原件的 raw/ 路径（例如 raw/sources/xxx.pdf），来自 read_page 输出的「来源文件」。写入 frontmatter sources，让知识图谱把本页连到原件节点。",
        }),
      ),
    }),
    async execute(toolCallId, params, signal) {
      const { id, title, sources } = params as { id: string; title?: string; sources?: string[] };

      // Security: engine already enforces wiki/ traversal guard
      const page = await engine.createPage(vaultRoot, id, title, sources);

      return {
        content: [{ type: "text", text: `已创建页面 [[${page.id}]]` }],
        details: { pageId: page.id, path: page.path, title: page.title },
      };
    },
  };
}