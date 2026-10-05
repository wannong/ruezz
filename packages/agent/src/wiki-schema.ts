import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PURPOSE_SNIPPET = "Describe the goal, key questions, and scope of this wiki";

export function bundledWikiSchemaPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "schema", "RUEZZ_WIKI_SCHEMA.md");
}

export function loadBundledWikiSchema(): string {
  const schemaPath = bundledWikiSchemaPath();
  if (!existsSync(schemaPath)) {
    throw new Error(`Missing Ruezz wiki schema: ${schemaPath}`);
  }
  return readFileSync(schemaPath, "utf8").trim();
}

export function isDefaultPurposeTemplate(content: string): boolean {
  const text = content.trim();
  if (!text) return true;
  return text.includes(DEFAULT_PURPOSE_SNIPPET) && text.includes("## Key questions");
}

export async function loadVaultPurpose(vaultRoot: string): Promise<string | null> {
  const purposePath = path.join(vaultRoot, "wiki", "purpose.md");
  try {
    const text = (await readFile(purposePath, "utf8")).trim();
    if (!text || isDefaultPurposeTemplate(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export function formatWikiSchemaForPrompt(bundledSchema: string, vaultPurpose: string | null): string {
  const parts = ["## Wiki 维护规范（Schema）", bundledSchema];
  if (vaultPurpose) {
    parts.push("## 本库目标（wiki/purpose.md）", vaultPurpose);
  }
  return parts.join("\n\n");
}
