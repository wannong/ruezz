import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { WikiEngine } from "@wikihome/engine-api";
import { createBacklinksTool } from "./backlinks.js";
import { createCreatePageTool } from "./create-page.js";
import { createGetGraphTool } from "./get-graph.js";
import { createConvertToMarkdownTool } from "./convert-markdown.js";
import { createIngestFileTool, createIngestTextTool } from "./ingest.js";
import { createListPagesTool } from "./list-pages.js";
import { createReadPageTool } from "./read-page.js";
import { createSearchPagesTool } from "./search-pages.js";
import { createWritePageTool } from "./write-page.js";

/**
 * Create all WikiEngine-backed agent tools.
 */
export function createWikiTools(engine: WikiEngine, vaultRoot: string): AgentTool[] {
  return [
    createSearchPagesTool(engine, vaultRoot),
    createReadPageTool(engine, vaultRoot),
    createWritePageTool(engine, vaultRoot),
    createCreatePageTool(engine, vaultRoot),
    createListPagesTool(engine, vaultRoot),
    createGetGraphTool(engine, vaultRoot),
    createBacklinksTool(engine, vaultRoot),
    createIngestTextTool(engine, vaultRoot),
    createIngestFileTool(engine, vaultRoot),
    createConvertToMarkdownTool(vaultRoot),
  ];
}

export {
  createBacklinksTool,
  createConvertToMarkdownTool,
  createCreatePageTool,
  createGetGraphTool,
  createIngestFileTool,
  createIngestTextTool,
  createListPagesTool,
  createReadPageTool,
  createSearchPagesTool,
  createWritePageTool,
};
