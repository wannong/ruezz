export class MockLlm {
    queue;
    responder;
    constant;
    constructor(responder) {
        if (typeof responder === "function") {
            this.responder = responder;
            this.queue = [];
        }
        else if (Array.isArray(responder)) {
            this.queue = [...responder];
        }
        else {
            this.constant = responder;
            this.queue = [];
        }
    }
    async complete(messages) {
        if (this.responder)
            return { text: this.responder(messages) };
        if (this.constant !== undefined)
            return { text: this.constant };
        return { text: this.queue.shift() ?? "" };
    }
}
export class OpenAICompatibleClient {
    cfg;
    constructor(cfg) {
        this.cfg = cfg;
    }
    async complete(messages, opts) {
        const base = (this.cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
        const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
            body: JSON.stringify({
                model: opts?.model ?? this.cfg.model,
                messages,
                ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
                ...(opts?.temperature ? { temperature: opts.temperature } : {}),
            }),
        });
        if (!res.ok)
            throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
        const data = (await res.json());
        return { text: data.choices?.[0]?.message?.content ?? "" };
    }
}
export class AnthropicClient {
    cfg;
    constructor(cfg) {
        this.cfg = cfg;
    }
    async complete(messages, opts) {
        const base = (this.cfg.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
        const system = messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        const convo = messages.filter((m) => m.role !== "system");
        const res = await fetch(`${base}/v1/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.cfg.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: opts?.model ?? this.cfg.model,
                max_tokens: opts?.maxTokens ?? 1024,
                ...(opts?.temperature ? { temperature: opts.temperature } : {}),
                ...(system ? { system } : {}),
                messages: convo,
            }),
        });
        if (!res.ok)
            throw new Error(`Anthropic request failed (${res.status}): ${await res.text()}`);
        const data = (await res.json());
        const textBlock = data.content?.find((b) => b.type === "text");
        return { text: textBlock?.text ?? "" };
    }
}
/** Construct an {@link LlmClient} from a discriminated config. */
export function createLlmClient(cfg) {
    switch (cfg.provider) {
        case "mock":
            return new MockLlm(cfg.responder ?? cfg.responses ?? cfg.response ?? "");
        case "openai":
            return new OpenAICompatibleClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
        case "anthropic":
            return new AnthropicClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
    }
}
//# sourceMappingURL=llm-client.js.map