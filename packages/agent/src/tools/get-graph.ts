import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { WikiEngine } from "@wikihome/engine-api";

export function createGetGraphTool(engine: WikiEngine, vaultRoot: string): AgentTool {
  return {
    name: "get_graph",
    label: "获取知识图谱",
    description: "获取知识库的链接关系图谱。",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal) {
      const graph = await engine.getGraph(vaultRoot);
      
      const summary = `知识图谱包含 ${graph.nodes.length} 个节点和 ${graph.edges.length} 个链接。`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: graph,
      };
    },
  };
}
