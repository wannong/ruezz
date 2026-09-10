export declare const OPENAI_CODEX_MODELS: {
    readonly "gpt-5.3-codex-spark": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            minimal: string;
        };
        input: "text"[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
        };
        contextWindow: number;
        maxTokens: number;
    };
    readonly "gpt-5.4": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        compat: {
            supportsToolSearch: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            minimal: string;
        };
        input: ("image" | "text")[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            tiers: {
                inputTokensAbove: number;
                input: number;
                output: number;
                cacheRead: number;
                cacheWrite: number;
            }[];
        };
        contextWindow: number;
        maxTokens: number;
    };
    readonly "gpt-5.4-mini": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        compat: {
            supportsToolSearch: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            minimal: string;
        };
        input: ("image" | "text")[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
        };
        contextWindow: number;
        maxTokens: number;
    };
    readonly "gpt-5.5": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        compat: {
            supportsToolSearch: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            minimal: string;
        };
        input: ("image" | "text")[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            tiers: {
                inputTokensAbove: number;
                input: number;
                output: number;
                cacheRead: number;
                cacheWrite: number;
            }[];
        };
        contextWindow: number;
        maxTokens: number;
    };
    readonly "gpt-5.6-luna": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        compat: {
            supportsToolSearch: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            max: string;
            minimal: string;
        };
        input: ("image" | "text")[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            tiers: {
                inputTokensAbove: number;
                input: number;
                output: number;
                cacheRead: number;
                cacheWrite: number;
            }[];
        };
        contextWindow: number;
        maxTokens: number;
    };
    readonly "gpt-5.6-sol": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        compat: {
            supportsToolSearch: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            max: string;
            minimal: string;
        };
        input: ("image" | "text")[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            tiers: {
                inputTokensAbove: number;
                input: number;
                output: number;
                cacheRead: number;
                cacheWrite: number;
            }[];
        };
        contextWindow: number;
        maxTokens: number;
    };
    readonly "gpt-5.6-terra": {
        id: string;
        name: string;
        api: "openai-codex-responses";
        provider: string;
        baseUrl: string;
        compat: {
            supportsToolSearch: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            xhigh: string;
            max: string;
            minimal: string;
        };
        input: ("image" | "text")[];
        cost: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            tiers: {
                inputTokensAbove: number;
                input: number;
                output: number;
                cacheRead: number;
                cacheWrite: number;
            }[];
        };
        contextWindow: number;
        maxTokens: number;
    };
};
//# sourceMappingURL=openai-codex.models.d.ts.map