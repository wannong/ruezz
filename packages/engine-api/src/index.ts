import { z } from "zod";

export const VaultSettingsSchema = z.object({
  vaultPath: z.string().default(""),
  apiBaseUrl: z.string().default("https://api.openai.com/v1"),
  apiKey: z.string().default(""),
  model: z.string().default("gpt-4o-mini"),
  mock: z.boolean().default(false),
});

export type VaultSettings = z.infer<typeof VaultSettingsSchema>;

export const PageSummarySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  path: z.string().optional(),
});

export type PageSummary = z.infer<typeof PageSummarySchema>;

export const PageContentSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  body: z.string(),
  raw: z.string(),
});

export type PageContent = z.infer<typeof PageContentSchema>;

export const LintIssueSchema = z.object({
  pageId: z.string(),
  severity: z.enum(["error", "warn", "info"]),
  rule: z.string(),
  message: z.string(),
  autoFixable: z.boolean().default(false),
});

export type LintIssue = z.infer<typeof LintIssueSchema>;

export const IngestResultSchema = z.object({
  files: z.array(z.string()),
  reviews: z.number().optional(),
  sourcePath: z.string().optional(),
});

export type IngestResult = z.infer<typeof IngestResultSchema>;

export const AskResultSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()).default([]),
});

export type AskResult = z.infer<typeof AskResultSchema>;

/** Stable engine surface. Implement this to swap backends. */
export interface WikiEngine {
  initVault(root: string): Promise<void>;
  ingestFile(root: string, filePath: string): Promise<IngestResult>;
  ingestText(root: string, title: string, body: string): Promise<IngestResult>;
  readIndex(root: string): Promise<string>;
  findPages(root: string, query: string): Promise<PageSummary[]>;
  listPages(root: string): Promise<PageSummary[]>;
  readPage(root: string, idOrPath: string): Promise<PageContent | null>;
  lint(root: string): Promise<LintIssue[]>;
  ask(root: string, question: string): Promise<AskResult>;
  close?(root?: string): void;
}
