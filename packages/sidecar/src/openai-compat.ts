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

function causeText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i += 1) {
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message);
      const extra = cur as Error & { code?: string };
      if (extra.code && !parts.includes(extra.code)) parts.push(extra.code);
      cur = cur.cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(" | ");
}

export function describeNetworkError(err: unknown, action: string): string {
  const name = err instanceof Error ? err.name : "";
  const blob = `${name} ${causeText(err)}`;
  if (/TimeoutError|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|aborted due to timeout/i.test(blob)) {
    return `${action}失败：连接超时。请检查网络、防火墙，或是否需要代理。`;
  }
  if (/ENOTFOUND|getaddrinfo|ERR_NAME_NOT_RESOLVED/i.test(blob)) {
    return `${action}失败：无法解析服务器地址。请检查 Base URL 是否写对、电脑能否上网。`;
  }
  if (/ECONNREFUSED/i.test(blob)) {
    return `${action}失败：连接被拒绝。请确认地址和端口正确，且该 AI 服务已启动。`;
  }
  if (/ECONNRESET|EPIPE|UND_ERR_SOCKET|write ECONN/i.test(blob)) {
    return `${action}失败：连接被中断。请检查网络或对方服务是否稳定。`;
  }
  if (/CERT|UNABLE_TO_VERIFY|ERR_TLS|certificate/i.test(blob)) {
    return `${action}失败：HTTPS 证书校验失败。`;
  }
  if (/fetch failed|TypeError/i.test(blob)) {
    const extra = blob
      .replace(/TypeError/gi, "")
      .replace(/fetch failed/gi, "")
      .replace(/^\s*\|\s*/, "")
      .trim();
    return extra ? `${action}失败：连不上该 API（${extra}）。` : `${action}失败：连不上该 API。`;
  }
  return `${action}失败：${causeText(err) || "未知网络错误"}`;
}

async function fetchApi(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new Error(describeNetworkError(err, "连接 API"));
  }
}

export async function listOpenAiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const bases = candidateBases(baseUrl);
  if (!bases.length) throw new Error("请先填写 API Base URL");

  let lastError = "拉取模型失败";
  for (const base of bases) {
    const res = await fetchApi(`${base}/models`, {
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
  const res = await fetchApi(`${root}/v1/messages`, {
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
    const res = await fetchApi(`${base}/chat/completions`, {
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
