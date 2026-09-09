import { describe, expect, it } from "vitest";
import { createLlmClient, MockLlm, OpenAICompatibleClient } from "./llm-client.js";
const user = (content) => ({ role: "user", content });
describe("MockLlm", () => {
    it("returns a constant response", async () => {
        const llm = new MockLlm("hello");
        const r = await llm.complete([user("hi")]);
        expect(r.text).toBe("hello");
    });
    it("returns queued responses in order", async () => {
        const llm = new MockLlm(["first", "second"]);
        expect((await llm.complete([user("a")])).text).toBe("first");
        expect((await llm.complete([user("b")])).text).toBe("second");
    });
    it("supports a function responder that sees the messages", async () => {
        const llm = new MockLlm((msgs) => msgs.at(-1)?.content.toUpperCase() ?? "");
        expect((await llm.complete([user("echo me")])).text).toBe("ECHO ME");
    });
});
describe("createLlmClient", () => {
    it("builds a mock client from a canned response", async () => {
        const llm = createLlmClient({ provider: "mock", response: "canned" });
        expect(llm).toBeInstanceOf(MockLlm);
        expect((await llm.complete([user("x")])).text).toBe("canned");
    });
    it("builds an OpenAI-compatible client", () => {
        const llm = createLlmClient({ provider: "openai", apiKey: "sk-x", model: "gpt-4o-mini" });
        expect(llm).toBeInstanceOf(OpenAICompatibleClient);
    });
    it("defaults the OpenAI base URL so it also targets Ollama/OpenRouter via baseUrl override", () => {
        const llm = createLlmClient({
            provider: "openai",
            apiKey: "ollama",
            baseUrl: "http://localhost:11434/v1",
            model: "llama3.1",
        });
        expect(llm).toBeInstanceOf(OpenAICompatibleClient);
    });
});
//# sourceMappingURL=llm-client.test.js.map