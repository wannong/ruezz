const FETCH_MS = 15_000;

export function normalizeOpenAiBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Claude ids on OpenAI-compatible gateways. Foxnio 502s /chat/completions when tools are present. */
export function looksLikeClaudeModel(id: string): boolean {
  return /^claude\b/i.test(id.trim());
}

/**
 * Anthropic SDK posts to `${baseURL}/v1/messages`.
 * Settings store OpenAI-style `https://host/v1` — strip that suffix.
 */
export function anthropicMessagesBaseUrl(openaiBaseUrl: string): string {
  const trimmed = normalizeOpenAiBase(openaiBaseUrl);
  return trimmed.replace(/\/v1$/i, "") || trimmed;
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey.trim()) headers.authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

function candidateBases(url: string): string[] {
  const base = normalizeOpenAiBase(url);
  if (!base) return [];
  if (base.endsWith("/v1")) return [base];
  return [base, `${base}/v1`];
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.replace(/\s+/g, " ").slice(0, 240);
}

export async function listOpenAiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const bases = candidateBases(baseUrl);
  if (!bases.length) throw new Error("请先填写 API Base URL");

  let lastError = "拉取模型失败";
  for (const base of bases) {
    const res = await fetch(`${base}/models`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) {
      lastError = `拉取模型失败 HTTP ${res.status}：${await readError(res)}`;
      continue;
    }
    const json = (await res.json()) as
      | { data?: Array<{ id?: string; name?: string }> }
      | Array<{ id?: string; name?: string }>;
    const rows = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
    const ids = [...new Set(rows.map((row) => String(row.id ?? row.name ?? "").trim()).filter(Boolean))];
    if (!ids.length) {
      lastError = "接口没有返回模型列表";
      continue;
    }
    return ids.sort((a, b) => a.localeCompare(b));
  }
  throw new Error(lastError);
}

async function testAnthropicMessagesConnection(
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<{ ok: true; reply: string }> {
  const root = anthropicMessagesBaseUrl(baseUrl);
  if (!root) throw new Error("请先填写 API Base URL");
  const res = await fetch(`${root}/v1/messages`, {
    method: "POST",
    headers: {
      ...authHeaders(apiKey),
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8,
      stream: false,
      messages: [{ role: "user", content: "ping" }],
      // Agent always sends tools; foxnio 502s the OpenAI tools path, so probe this too.
      tools: [
        {
          name: "ping_tool",
          description: "connection probe",
          input_schema: { type: "object", properties: {} },
        },
      ],
    }),
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) {
    throw new Error(`测试连接失败 HTTP ${res.status}：${await readError(res)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const reply =
    json.content?.find((block) => block.type === "text" && block.text?.trim())?.text?.trim() || "连接成功";
  return { ok: true, reply };
}

export async function testOpenAiConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ ok: true; reply: string }> {
  const modelId = model.trim();
  if (!modelId) throw new Error("请先填写或选择模型名");
  if (looksLikeClaudeModel(modelId)) {
    return testAnthropicMessagesConnection(baseUrl, apiKey, modelId);
  }

  const bases = candidateBases(baseUrl);
  if (!bases.length) throw new Error("请先填写 API Base URL");

  let lastError = "测试连接失败";
  for (const base of bases) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        ...authHeaders(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) {
      lastError = `测试连接失败 HTTP ${res.status}：${await readError(res)}`;
      continue;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = json.choices?.[0]?.message?.content?.trim() || "连接成功";
    return { ok: true, reply };
  }
  throw new Error(lastError);
}
