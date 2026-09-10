const FETCH_MS = 15_000;

export function normalizeOpenAiBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
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

export async function testOpenAiConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ ok: true; reply: string }> {
  const bases = candidateBases(baseUrl);
  if (!bases.length) throw new Error("请先填写 API Base URL");
  const modelId = model.trim();
  if (!modelId) throw new Error("请先填写或选择模型名");

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
