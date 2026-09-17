import { loadPref, savePref } from "./prefs";

const keyFor = (vaultPath: string) => `favorites:${vaultPath}`;

export function loadFavorites(vaultPath: string): string[] {
  const value = loadPref<unknown>(keyFor(vaultPath), []);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export function saveFavorites(vaultPath: string, ids: string[]): void {
  savePref(keyFor(vaultPath), ids);
}

export function remapFavoritePage(ids: string[], from: string, to: string): string[] {
  return ids.map((id) => id === from ? to : id);
}

export function remapFavoriteFolder(ids: string[], from: string, to: string): string[] {
  const prefix = `${from}/`;
  return ids.map((id) => id.startsWith(prefix) ? `${to}${id.slice(from.length)}` : id);
}
