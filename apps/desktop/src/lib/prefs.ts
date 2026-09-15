export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`centaur.${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`centaur.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
