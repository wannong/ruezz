import type { LlmClient, LlmCompleteOptions, LlmMessage } from "./types.js";
/**
 * BYOK LLM clients. The deterministic core never imports this module; callers
 * (CLI / MCP / skill / autonomous runner) construct a client and inject it.
 *
 * - {@link MockLlm}: canned/scripted responses — makes every consumer fully
 *   testable with no network, and powers the M1 end-to-end smoke test.
 * - {@link OpenAICompatibleClient}: any OpenAI-compatible `/chat/completions`
 *   endpoint — OpenAI, Ollama (`/v1`), OpenRouter, etc.
 * - {@link AnthropicClient}: the Anthropic Messages API.
 */
type MockResponder = string | string[] | ((messages: LlmMessage[]) => string);
export declare class MockLlm implements LlmClient {
    private readonly queue;
    private readonly responder?;
    private readonly constant?;
    constructor(responder: MockResponder);
    complete(messages: LlmMessage[]): Promise<{
        text: string;
    }>;
}
export interface OpenAIConfig {
    apiKey: string;
    baseUrl?: string;
    model: string;
}
export declare class OpenAICompatibleClient implements LlmClient {
    private readonly cfg;
    constructor(cfg: OpenAIConfig);
    complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<{
        text: string;
    }>;
}
export interface AnthropicConfig {
    apiKey: string;
    baseUrl?: string;
    model: string;
}
export declare class AnthropicClient implements LlmClient {
    private readonly cfg;
    constructor(cfg: AnthropicConfig);
    complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<{
        text: string;
    }>;
}
export type LlmClientConfig = {
    provider: "mock";
    response?: string;
    responses?: string[];
    responder?: (m: LlmMessage[]) => string;
} | {
    provider: "openai";
    apiKey: string;
    baseUrl?: string;
    model: string;
} | {
    provider: "anthropic";
    apiKey: string;
    baseUrl?: string;
    model: string;
};
/** Construct an {@link LlmClient} from a discriminated config. */
export declare function createLlmClient(cfg: LlmClientConfig): LlmClient;
export {};
//# sourceMappingURL=llm-client.d.ts.map