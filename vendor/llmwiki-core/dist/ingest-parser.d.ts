/**
 * Parse the structured block output of the two-step ingest "generation" stage.
 *
 * The model emits one or more blocks:
 *
 *     ---FILE: wiki/concepts/foo.md---
 *     <full page markdown, including frontmatter>
 *     ---END FILE---
 *
 *     ---REVIEW: contradiction | Title of the issue---
 *     <explanation>
 *     ---END REVIEW---
 *
 * Files become wiki pages; reviews become maintenance items (contradictions,
 * gaps, suggestions). Prose outside blocks is ignored. This parser is pure and
 * snapshot-tested so prompt changes can't silently break it.
 */
export interface IngestFile {
    path: string;
    content: string;
}
export interface IngestReview {
    type: string;
    title: string;
    content: string;
}
export interface IngestBlocks {
    files: IngestFile[];
    reviews: IngestReview[];
}
export declare function parseIngestBlocks(text: string): IngestBlocks;
//# sourceMappingURL=ingest-parser.d.ts.map