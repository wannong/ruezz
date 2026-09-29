export type FrontmatterParts = {
  /** Full frontmatter block including `---` delimiters, or null if absent. */
  frontmatter: string | null;
  body: string;
};

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function splitFrontmatter(raw: string): FrontmatterParts {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: null, body: raw };
  return { frontmatter: match[0], body: raw.slice(match[0].length) };
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (!frontmatter) return body;
  return frontmatter + body;
}
