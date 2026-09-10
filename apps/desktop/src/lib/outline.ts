import { slugHeading } from "./wikilinks";

export type OutlineItem = {
  level: number;
  text: string;
  id: string;
};

export function parseOutline(body: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const line of body.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/#+\s*$/, "").trim();
    items.push({ level: match[1].length, text, id: slugHeading(text) });
  }
  return items;
}
