/** Minimal ProseMirror JSON shapes used by the markdown bridge. */
export type PMMark = { type: string; attrs?: Record<string, unknown> };

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
};

export type PMDoc = PMNode & { type: "doc" };

/** Original markdown for each top-level block, so untouched blocks stay byte-identical. */
export type MarkdownOrigin = {
  sources: Array<string | null>;
  snapshots: string[];
};

export const EMPTY_ORIGIN: MarkdownOrigin = { sources: [], snapshots: [] };
