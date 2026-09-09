import { type IngestBlocks } from "./ingest-parser.js";
import type { IngestContext, IngestSource } from "./ingest.js";
import type { LlmClient } from "./types.js";
export declare function runIngest(source: IngestSource, ctx: IngestContext, llm: LlmClient): Promise<IngestBlocks>;
//# sourceMappingURL=ingest-runner.d.ts.map