const PREFIX = "ruezz.";
const LEGACY_PREFIX = "centaur.";

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`) ?? localStorage.getItem(`${LEGACY_PREFIX}${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
