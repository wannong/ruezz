import type { AskResult, WikiEngine } from "@wikihome/engine-api";

/**
 * Thin ask agent. MVP delegates to the engine's compiled-wiki ask.
 * Future: multi-step tool loop that only uses engine-api primitives.
 */
export async function askQuestion(engine: WikiEngine, root: string, question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: "请输入一个问题。", sources: [] };
  }
  return engine.ask(root, trimmed);
}
