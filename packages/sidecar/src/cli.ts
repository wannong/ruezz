#!/usr/bin/env node
import readline from "node:readline";
import { SidecarSession, type RpcRequest } from "./server.js";

const session = new SidecarSession();

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: RpcRequest;
  try {
    req = JSON.parse(trimmed) as RpcRequest;
  } catch {
    process.stdout.write(`${JSON.stringify({ id: null, error: { message: "invalid json" } })}\n`);
    return;
  }
  const emit =
    req.method === "agent_prompt"
      ? (event: { type: string }) => {
          process.stdout.write(`${JSON.stringify({ method: "agent_event", params: event })}\n`);
        }
      : undefined;
  const res = await session.handle(req, emit);
  process.stdout.write(`${JSON.stringify(res)}\n`);
});

rl.on("close", () => {
  session.close();
  process.exit(0);
});

process.stdout.write(`${JSON.stringify({ id: "boot", result: { ok: true, version: "0.1.0" } })}\n`);
