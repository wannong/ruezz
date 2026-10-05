/** Derive a wiki page title from pasted text (mirrors engine titleFromMarkdown). */
export function titleFromPaste(body: string): string {
  const trimmed = body.trim();
  const heading = trimmed.match(/^#\s+(.+)$/m);
  if (heading?.[1]?.trim()) return heading[1].trim();

  const first = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (first && first.length <= 80) return first;

  const day = new Date().toISOString().slice(0, 10);
  return `剪贴笔记 ${day}`;
}
