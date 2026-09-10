import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createIngestTextTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "ingest_text",
    label: "入库文本",
    description: "将文本内容入库，生成新的知识页面。",
    parameters: Type.Object({
      title: Type.String({ description: "内容标题" }),
      text: Type.String({ description: "要入库的文本内容" }),
    }),
    async execute(toolCallId, params, signal) {
      const { title, text } = params as { title: string; text: string };
      const result = await engine.ingestText(vaultRoot, title, text);
      
      const summary = `已入库文本，生成 ${result.files.length} 个页面：\n${result.files.map((f) => `- ${f}`).join("\n")}`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: result,
      };
    },
  };
}

export function createIngestFileTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "ingest_file",
    label: "入库文件",
    description: "将文件入库，生成新的知识页面。文件必须在 raw/sources/ 目录内。",
    parameters: Type.Object({
      filePath: Type.String({ description: "文件路径（相对于 vault root）" }),
    }),
    async execute(toolCallId, params, signal) {
      const { filePath } = params as { filePath: string };
      const result = await engine.ingestFile(vaultRoot, filePath);
      
      const summary = `已入库文件 ${filePath}，生成 ${result.files.length} 个页面：\n${result.files.map((f) => `- ${f}`).join("\n")}`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: result,
      };
    },
  };
}
