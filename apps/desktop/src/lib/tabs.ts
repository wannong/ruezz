export type Tab = { kind: "page"; id: string };

export function tabKey(tab: Tab): string {
  return `page:${tab.id}`;
}

export function tabLabel(tab: Tab, titleFor: (id: string) => string): string {
  return titleFor(tab.id);
}
