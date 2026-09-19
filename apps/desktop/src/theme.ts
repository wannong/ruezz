export type Theme = "dark" | "light";

const KEY = "ruezz.theme";
const LEGACY_KEYS = ["centaur.theme", "wikihome.theme"];

export function loadTheme(): Theme {
  try {
    for (const key of [KEY, ...LEGACY_KEYS]) {
      const stored = localStorage.getItem(key);
      if (stored === "light" || stored === "dark") return stored;
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === "light" ? "#ffffff" : "#1e1e1e";
  root.style.color = theme === "light" ? "#222222" : "#dcddde";
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}
