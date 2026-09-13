import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { SidecarSession } from "./server.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sameToken(actual: string | undefined, expected: string): boolean {
  if (!actual?.startsWith("Bearer ")) return false;
  const token = Buffer.from(actual.slice(7), "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return token.length === wanted.length && timingSafeEqual(token, wanted);
}

/** Optional HTTP wrapper for Vite-only / non-Tauri development. */
export function startHttpServer(port = Number(process.env.WIKIHOME_HTTP_PORT ?? 8787)) {
  const token = process.env.WIKIHOME_HTTP_TOKEN?.trim();
  if (!token || token.length < 24) {
    throw new Error("WIKIHOME_HTTP_TOKEN 必须设置为至少 24 个字符的随机值");
  }
  const allowedOrigins = new Set(
    (process.env.WIKIHOME_HTTP_ORIGINS ?? "http://localhost:1420,http://127.0.0.1:1420")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const session = new SidecarSession();

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "origin not allowed" } }));
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: "0.1.0" }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/rpc") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    if (!sameToken(req.headers.authorization, token)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "unauthorized" } }));
      return;
    }
    const declaredLength = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "request too large" } }));
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += (chunk as Buffer).length;
      if (received > MAX_BODY_BYTES) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "request too large" } }));
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    let parsed: { id: string | number; method: string; params?: Record<string, unknown> };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid json" } }));
      return;
    }
    const params = parsed.params ?? {};
    if (parsed.method === "vault_ingest" && params.approvedExternal === true) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "HTTP 模式不能授权读取 vault 外文件" } }));
      return;
    }
    const stream = parsed.method === "agent_prompt" && params.stream === true;
    if (stream) {
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
      });
      const abortOnClose = () => {
        if (!res.writableEnded) session.abortPrompt();
      };
      req.on("close", abortOnClose);
      try {
         const result = await session.handle(parsed, (event) => {
           res.write(`${JSON.stringify(event)}\n`);
         });
        if (result.error) {
          res.write(`${JSON.stringify({ type: "error", message: result.error.message })}\n`);
        } else {
          res.write(`${JSON.stringify({ type: "result", result: result.result })}\n`);
        }
      } finally {
        req.off("close", abortOnClose);
      }
      res.end();
      return;
    }
    const result = await session.handle(parsed);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`wikihome http sidecar on http://127.0.0.1:${port}`);
  });

  return { server, session };
}
