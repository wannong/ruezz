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
  tags: z.array(z.string()).optional(),
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

export const GraphNodeDtoSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  degree: z.number(),
});

export const GraphEdgeDtoSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
});

export const GraphDtoSchema = z.object({
  nodes: z.array(GraphNodeDtoSchema),
  edges: z.array(GraphEdgeDtoSchema),
  dataVersion: z.number(),
});

export type GraphNodeDto = z.infer<typeof GraphNodeDtoSchema>;
export type GraphEdgeDto = z.infer<typeof GraphEdgeDtoSchema>;
export type GraphDto = z.infer<typeof GraphDtoSchema>;

/** Stable engine surface. Implement this to swap backends. */
export interface WikiEngine {
  initVault(root: string): Promise<void>;
  ingestFile(root: string, filePath: string): Promise<IngestResult>;
  ingestText(root: string, title: string, body: string): Promise<IngestResult>;
  readIndex(root: string): Promise<string>;
  findPages(root: string, query: string): Promise<PageSummary[]>;
  listPages(root: string): Promise<PageSummary[]>;
  readPage(root: string, idOrPath: string): Promise<PageContent | null>;
  writePage(root: string, idOrPath: string, raw: string): Promise<PageContent>;
  createPage(root: string, id: string, title?: string): Promise<PageContent>;
  copyPage(root: string, fromId: string, toId: string): Promise<PageContent>;
  renamePage(root: string, fromId: string, toId: string): Promise<PageContent>;
  listFolders(root: string): Promise<string[]>;
  createFolder(root: string, id: string): Promise<{ id: string }>;
  copyFolder(root: string, fromId: string, toId: string): Promise<{ id: string }>;
  renameFolder(root: string, fromId: string, toId: string): Promise<{ id: string }>;
  lint(root: string): Promise<LintIssue[]>;
  ask(root: string, question: string): Promise<AskResult>;
  getGraph(root: string): Promise<GraphDto>;
  backlinks(root: string, pageId: string): Promise<PageSummary[]>;
  close?(root?: string): void;
}
