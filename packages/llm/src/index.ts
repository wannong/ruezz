export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResponse {
  text: string;
}

export interface LlmCompleteOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmClient {
  complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmResponse>;
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export class OpenAICompatibleClient implements LlmClient {
  constructor(private readonly cfg: OpenAICompatibleConfig) {}

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmResponse> {
    const base = (this.cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const model = opts?.model ?? this.cfg.model;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text };
  }
}

/** Matches llmwiki-core e2e mock so ingest/ask work offline. */
export function wikihomeMockResponder(messages: LlmMessage[]): string {
  const last = messages.at(-1)?.content ?? "";
  if (last.includes("produce a structured analysis")) {
    return "Key concept: attention. Connects to transformers.";
  }
  if (last.includes("write the wiki pages")) {
    return [
      "---FILE: wiki/concepts/attention.md---",
      "---",
      "type: concept",
      "title: Attention",
      "tags: [transformers, attention]",
      'related: ["concepts/transformers"]',
      "sources: []",
      "created: 2026-09-09",
      "updated: 2026-09-09",
      "confidence: EXTRACTED",
      "---",
      "",
      "Attention lets a model focus on relevant input. See [[concepts/transformers]].",
      "---END FILE---",
    ].join("\n");
  }
  return "Attention lets a model focus on the relevant parts of the input [[concepts/attention]].";
}

export class MockLlmClient implements LlmClient {
  constructor(private readonly responder: (messages: LlmMessage[]) => string = wikihomeMockResponder) {}

  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    return { text: this.responder(messages) };
  }
}

export function createLlmClient(opts: {
  mock?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): LlmClient {
  if (opts.mock || !opts.apiKey) {
    return new MockLlmClient();
  }
  return new OpenAICompatibleClient({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model ?? "gpt-4o-mini",
  });
}
