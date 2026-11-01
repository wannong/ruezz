/** Quote a selection into the agent composer draft. */
export function appendSelectionToDraft(draft: string, text: string): string {
  const quote = text.trim();
  if (!quote) return draft;
  const block = `> ${quote.replace(/\n/g, "\n> ")}`;
  const base = draft.trimEnd();
  return base ? `${base}\n\n${block}\n\n` : `${block}\n\n`;
}
