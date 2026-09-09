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
const FILE_OPEN = /^---\s*FILE:\s*(.+?)\s*---\s*$/;
const FILE_CLOSE = /^---\s*END\s*FILE\s*---\s*$/;
const REVIEW_OPEN = /^---\s*REVIEW:\s*([^|]+?)\s*\|\s*(.+?)\s*---\s*$/;
const REVIEW_CLOSE = /^---\s*END\s*REVIEW\s*---\s*$/;
export function parseIngestBlocks(text) {
    const files = [];
    const reviews = [];
    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length) {
        const line = lines[i] ?? "";
        const fileOpen = line.match(FILE_OPEN);
        if (fileOpen) {
            const path = fileOpen[1].trim();
            const buf = [];
            i++;
            while (i < lines.length && !FILE_CLOSE.test(lines[i] ?? "")) {
                buf.push(lines[i] ?? "");
                i++;
            }
            i++; // consume the close fence
            files.push({ path, content: buf.join("\n").trim() });
            continue;
        }
        const reviewOpen = line.match(REVIEW_OPEN);
        if (reviewOpen) {
            const type = reviewOpen[1].trim();
            const title = reviewOpen[2].trim();
            const buf = [];
            i++;
            while (i < lines.length && !REVIEW_CLOSE.test(lines[i] ?? "")) {
                buf.push(lines[i] ?? "");
                i++;
            }
            i++; // consume the close fence
            reviews.push({ type, title, content: buf.join("\n").trim() });
            continue;
        }
        i++;
    }
    return { files, reviews };
}
//# sourceMappingURL=ingest-parser.js.map