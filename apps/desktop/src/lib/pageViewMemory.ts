import type { NoteMode } from "../components/NoteView";

export type PageViewMemory = {
  mode?: NoteMode;
  pdfScrollTop?: number;
  pdfPage?: number;
  pdfScale?: number;
  docxScrollTop?: number;
  readScrollTop?: number;
};

export function defaultPageMode(pageType: string | undefined, hasSource: boolean): NoteMode {
  if (pageType === "source" && hasSource) return "source";
  return "read";
}

export function detectPdfPageFromScroll(
  container: HTMLElement,
  pageElements: Map<number, HTMLElement>,
  fallback = 1,
): number {
  const marker = container.scrollTop + container.clientHeight * 0.32;
  let bestPage = fallback;
  let bestDistance = Infinity;
  for (const [page, element] of pageElements) {
    const distance = Math.abs(element.offsetTop - marker);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPage = page;
    }
  }
  return bestPage;
}

export function remapRecordId<T>(
  memory: Record<string, T>,
  oldId: string,
  newId: string,
): Record<string, T> {
  if (oldId === newId || !(oldId in memory)) return memory;
  const next = { ...memory };
  next[newId] = memory[oldId];
  delete next[oldId];
  return next;
}

export function remapRecordIds<T>(
  memory: Record<string, T>,
  mapId: (id: string) => string,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [id, state] of Object.entries(memory)) {
    next[mapId(id)] = state;
  }
  return next;
}
