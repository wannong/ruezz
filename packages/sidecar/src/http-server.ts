import http from "node:http";
import { SidecarSession } from "./server.js";
import { settingsFromEnv } from "./settings-store.js";

/** Optional HTTP wrapper for Vite-only / non-Tauri development. */
export function startHttpServer(port = Number(process.env.WIKIHOME_HTTP_PORT ?? 8787)) {
  const session = new SidecarSession(settingsFromEnv());

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
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
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    let parsed: { id: string | number; method: string; params?: Record<string, unknown> };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid json" } }));
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
