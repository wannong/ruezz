import type { WikiEngine } from "@wikihome/engine-api";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { resolveInsideVault, toVaultRelative } from "./vault-path.js";

export function createIngestTextTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "ingest_text",
    label: "入库文本",
    description:
      "把一段文本归档到 raw/sources，并整篇写入 wiki/sources 一页。不会按标题拆成多个概念页。",
    parameters: Type.Object({
      title: Type.String({ description: "内容标题" }),
      text: Type.String({ description: "要入库的文本内容" }),
    }),
    async execute(_toolCallId, params) {
      const { title, text } = params as { title: string; text: string };
      const result = await engine.ingestText(vaultRoot, title, text);

      const summary = `已整篇入库文本，写入 ${result.files.length} 页（未拆页）：\n${result.files.map((f) => `- ${f}`).join("\n")}`;

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
    description:
      "归档原文件到 raw/sources。Markdown/文本整篇写入 wiki/sources 一页；PDF/Word/PPT/Excel 会先转成一篇 Markdown 再入库。不会按标题拆页。文件须在 vault 内。",
    parameters: Type.Object({
      filePath: Type.String({ description: "文件路径（相对于 vault root）" }),
    }),
    async execute(_toolCallId, params) {
      const { filePath } = params as { filePath: string };
      const resolved = resolveInsideVault(vaultRoot, filePath);
      const result = await engine.ingestFile(vaultRoot, resolved);
      const shown = toVaultRelative(vaultRoot, resolved);
      const summary = `已整篇入库 ${shown}，写入 ${result.files.length} 页（未拆页）：\n${result.files.map((f) => `- ${f}`).join("\n")}`;

      return {
        content: [{ type: "text", text: summary }],
        details: result,
      };
    },
  };
}
