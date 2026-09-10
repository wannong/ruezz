export type Tab = { kind: "page"; id: string } | { kind: "graph" };

export function tabKey(tab: Tab): string {
  return tab.kind === "graph" ? "graph" : `page:${tab.id}`;
}

export function tabLabel(tab: Tab, titleFor: (id: string) => string): string {
  return tab.kind === "graph" ? "图谱" : titleFor(tab.id);
}
