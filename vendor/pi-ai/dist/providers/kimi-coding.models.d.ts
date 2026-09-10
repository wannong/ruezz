export declare const KIMI_CODING_MODELS: {
    readonly k2p7: {
        id: string;
        name: string;
        api: "anthropic-messages";
        provider: string;
        baseUrl: string;
        headers: {
            "User-Agent": string;
        };
        compat: {
            forceAdaptiveThinking: true;
        };
        reasoning: true;
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
    readonly k3: {
        id: string;
        name: string;
        api: "anthropic-messages";
        provider: string;
        baseUrl: string;
        headers: {
            "User-Agent": string;
        };
        compat: {
            allowEmptySignature: true;
            forceAdaptiveThinking: true;
        };
        reasoning: true;
        thinkingLevelMap: {
            off: null;
            minimal: null;
            low: null;
            medium: null;
            high: null;
            xhigh: null;
            max: string;
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
    readonly "kimi-for-coding": {
        id: string;
        name: string;
        api: "anthropic-messages";
        provider: string;
        baseUrl: string;
        headers: {
            "User-Agent": string;
        };
        compat: {
            allowEmptySignature: true;
            forceAdaptiveThinking: true;
        };
        reasoning: true;
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
    readonly "kimi-for-coding-highspeed": {
        id: string;
        name: string;
        api: "anthropic-messages";
        provider: string;
        baseUrl: string;
        headers: {
            "User-Agent": string;
        };
        compat: {
            forceAdaptiveThinking: true;
        };
        reasoning: true;
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
    readonly "kimi-k2-thinking": {
        id: string;
        name: string;
        api: "anthropic-messages";
        provider: string;
        baseUrl: string;
        headers: {
            "User-Agent": string;
        };
        compat: {
            forceAdaptiveThinking: true;
        };
        reasoning: true;
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
};
//# sourceMappingURL=kimi-coding.models.d.ts.map