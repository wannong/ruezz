import { useEffect, useRef, useState } from "react";

export type PresencePhase = "enter" | "exit" | "idle";

export interface Presence {
  /** Keep the element mounted while true (true during enter, idle, and exit). */
  visible: boolean;
  phase: PresencePhase;
}

/** Keep in sync with --dur-fast / --dur-base in styles.css. */
export const PRESENCE_MS = {
  fast: 100,
  base: 180,
} as const;

/**
 * Keeps a subtree mounted through its CSS exit animation, then unmounts it.
 * `durationMs` must match the exit animation length of the wrapped layer.
 */
export function usePresence(open: boolean, durationMs: number = PRESENCE_MS.base): Presence {
  const [visible, setVisible] = useState(open);
  const [phase, setPhase] = useState<PresencePhase>(open ? "enter" : "idle");
  const timer = useRef<number | undefined>(undefined);
  const seen = useRef(false);

  useEffect(() => {
    window.clearTimeout(timer.current);

    if (!seen.current) {
      seen.current = true;
      if (!open) return () => window.clearTimeout(timer.current);
      setVisible(true);
      setPhase("enter");
      timer.current = window.setTimeout(() => setPhase("idle"), durationMs);
      return () => window.clearTimeout(timer.current);
    }

    if (open) {
      setVisible(true);
      setPhase("enter");
      timer.current = window.setTimeout(() => setPhase("idle"), durationMs);
    } else {
      setPhase("exit");
      timer.current = window.setTimeout(() => {
        setVisible(false);
        setPhase("idle");
      }, durationMs);
    }

    return () => window.clearTimeout(timer.current);
  }, [open, durationMs]);

  return { visible, phase };
}
