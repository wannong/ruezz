#!/usr/bin/env node
import readline from "node:readline";
import { findBundledPython } from "@wikihome/engine-llmwiki";
import { SidecarSession, type RpcRequest } from "./server.js";

const bundledPython = findBundledPython();
if (bundledPython) {
  process.env.WIKIHOME_PYTHON = bundledPython;
}

process.on("uncaughtException", (err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});

let session: SidecarSession;
try {
  session = new SidecarSession();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
}

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
  const res = await session.handle(req, emit, {
    // The Tauri-owned stdin channel is trusted only for the explicit desktop import flag.
    allowExternalImport: true,
    exposeSecrets: true,
  });
  process.stdout.write(`${JSON.stringify(res)}\n`);
});

rl.on("close", () => {
  session.close();
  process.exit(0);
});

process.stdout.write(`${JSON.stringify({ id: "boot", result: { ok: true, version: "0.1.0" } })}\n`);
