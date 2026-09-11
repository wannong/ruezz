import type { AskResult, WikiEngine } from "@wikihome/engine-api";

/**
 * Legacy: Thin ask agent. MVP delegates to the engine's compiled-wiki ask.
 * @deprecated Use agent-runner with tool loop instead.
 */
export async function askQuestion(engine: WikiEngine, root: string, question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: "请输入一个问题。", sources: [] };
  }
  return engine.ask(root, trimmed);
}

// Export types, storage, and runner
export * from "./types.js";
export { SessionStorage } from "./session-storage.js";
export { AgentRunner } from "./agent-runner.js";
export {
  formatSkillsForPrompt,
  loadBundledSkills,
  selectSkillsForMessage,
} from "./skills.js";
export type { AgentSkill } from "./skills.js";
export { createWikiTools } from "./tools/index.js";
