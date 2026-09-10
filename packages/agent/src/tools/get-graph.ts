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
      
      // Create readable summary with top nodes and edges (truncate to keep reasonable size)
      const topNodes = graph.nodes.slice(0, 50).map((n) => `- [[${n.id}]] (${n.type}, ${n.degree} links)`).join("\n");
      const moreNodes = graph.nodes.length > 50 ? `\n...还有 ${graph.nodes.length - 50} 个节点` : "";
      
      const topEdges = graph.edges.slice(0, 30).map((e) => `- [[${e.source}]] -> [[${e.target}]] (${e.relation})`).join("\n");
      const moreEdges = graph.edges.length > 30 ? `\n...还有 ${graph.edges.length - 30} 条链接` : "";
      
      const summary = `知识图谱包含 ${graph.nodes.length} 个节点和 ${graph.edges.length} 条链接。\n\n主要节点：\n${topNodes}${moreNodes}\n\n主要链接：\n${topEdges}${moreEdges}`;
      
      return {
        content: [{ type: "text", text: summary }],
        details: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dataVersion: graph.dataVersion },
      };
    },
  };
}
