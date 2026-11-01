/**
 * Which archived originals the preview can render natively.
 *
 * Everything else in the literature library is converted to one Markdown page on
 * ingest, so its "original" is shown as the readable Markdown instead.
 */
export const RENDERABLE_SOURCE_TYPES = new Set(["pdf", "docx"]);

/** True when an archived original can be rendered in the preview pane. */
export function isRenderableSourceType(sourceType: string | undefined | null): boolean {
  if (!sourceType) return false;
  return RENDERABLE_SOURCE_TYPES.has(sourceType.toLowerCase().replace(/^\./, ""));
}
