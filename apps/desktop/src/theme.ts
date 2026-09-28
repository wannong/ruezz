export type ColorPalette = "dark" | "light" | "warm" | "blue-tone";

/** Graph / canvas rendering mode derived from the active palette. */
export type Theme = "dark" | "light";

const PALETTE_KEY = "ruezz.palette";
const LEGACY_THEME_KEYS = ["ruezz.theme", "centaur.theme", "wikihome.theme"];

export const PALETTE_ORDER: ColorPalette[] = ["dark", "light", "warm", "blue-tone"];

export const PALETTE_META: Record<
  ColorPalette,
  {
    label: string;
    description: string;
    swatches: string[];
    preview: { chrome: string; sidebar: string; panel: string; border: string };
  }
> = {
  dark: {
    label: "暗色",
    description: "经典深色界面，深底浅字",
    swatches: ["#111111", "#202020", "#1E1E1E", "#DCDDDE", "#6AA9FF"],
    preview: { chrome: "#111111", sidebar: "#202020", panel: "#1e1e1e", border: "#3f3f3f" },
  },
  light: {
    label: "明亮",
    description: "经典浅色界面，白底深字",
    swatches: ["#F0F0F0", "#F7F7F7", "#FFFFFF", "#222222", "#1769D1"],
    preview: { chrome: "#f0f0f0", sidebar: "#f7f7f7", panel: "#ffffff", border: "#d0d0d0" },
  },
  warm: {
    label: "米白",
    description: "奶油米白阅读区、深色文字，边框最深",
    swatches: ["#190019", "#2B124C", "#DFB6B2", "#FBE4D8", "#FFF9F4"],
    preview: { chrome: "#DFB6B2", sidebar: "#FBE4D8", panel: "#FFF9F4", border: "#190019" },
  },
  "blue-tone": {
    label: "蓝调",
    description: "浅灰蓝阅读区、深色文字，边框最深",
    swatches: ["#06141B", "#11212D", "#9BA8AB", "#CCD0CF", "#F2F3F3"],
    preview: { chrome: "#9BA8AB", sidebar: "#CCD0CF", panel: "#F2F3F3", border: "#06141B" },
  },
};

function normalizePalette(stored: string | null): ColorPalette | null {
  if (stored === "dark" || stored === "light" || stored === "warm" || stored === "blue-tone") {
    return stored;
  }
  if (stored === "blue-black") return "dark";
  return null;
}

export function loadPalette(): ColorPalette {
  try {
    const stored = normalizePalette(localStorage.getItem(PALETTE_KEY));
    if (stored) return stored;
    for (const key of LEGACY_THEME_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy === "light") return "light";
      if (legacy === "dark") return "dark";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyPalette(palette: ColorPalette): void {
  const root = document.documentElement;
  const scheme = paletteGraphTheme(palette);
  root.dataset.palette = palette;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    /* ignore quota / private mode */
  }
}

export function paletteGraphTheme(palette: ColorPalette): Theme {
  return palette === "dark" ? "dark" : "light";
}

/** @deprecated Use loadPalette / applyPalette. Kept for graph components. */
export function loadTheme(): Theme {
  return paletteGraphTheme(loadPalette());
}

/** @deprecated Use applyPalette. */
export function applyTheme(theme: Theme): void {
  applyPalette(theme === "light" ? "light" : "dark");
}

export function cyclePalette(current: ColorPalette): ColorPalette {
  const index = PALETTE_ORDER.indexOf(current);
  const next = PALETTE_ORDER[(index + 1) % PALETTE_ORDER.length];
  return next;
}
