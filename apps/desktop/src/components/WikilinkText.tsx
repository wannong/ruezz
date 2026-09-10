import type { PageSummary } from "../api";
import { resolvePageId } from "../lib/wikilinks";

const WIKI_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

type WikilinkTextProps = {
  text: string;
  pages: PageSummary[];
  onOpen: (id: string) => void;
};

export function WikilinkText({ text, pages, onOpen }: WikilinkTextProps) {
  const nodes: Array<string | { key: string; label: string; id: string }> = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(new RegExp(WIKI_RE.source, "g"))) {
    const idx = match.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const target = match[1].trim();
    const label = (match[2] ?? match[1]).trim();
    nodes.push({
      key: `${idx}-${i++}`,
      label,
      id: resolvePageId(target, pages) ?? target,
    });
    last = idx + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return (
    <>
      {nodes.map((node, index) =>
        typeof node === "string" ? (
          <span key={`t-${index}`}>{node}</span>
        ) : (
          <button key={node.key} type="button" className="wikilink" onClick={() => onOpen(node.id)}>
            {node.label}
          </button>
        ),
      )}
    </>
  );
}
