export type Theme = "dark" | "light";

const KEY = "centaur.theme";

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
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
