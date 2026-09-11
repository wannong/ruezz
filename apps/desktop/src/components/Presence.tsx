import { Fragment, type ReactNode, useRef } from "react";
import { PRESENCE_MS, usePresence } from "../lib/usePresence";

type PresenceProps = {
  open: boolean;
  duration?: number;
  className?: string;
  children: ReactNode;
};

/**
 * Keeps children mounted through their exit transition, then unmounts them.
 * Phase is exposed as `data-presence` ("enter" | "exit") so CSS can play
 * dedicated exit keyframes, e.g. `[data-presence="exit"] .modal { … }`.
 *
 * Entrance is the child's own mount animation. Re-opening while an exit is
 * still running remounts children so the enter animation can play again.
 */
export function Presence({
  open,
  duration = PRESENCE_MS.base,
  className,
  children,
}: PresenceProps) {
  const { visible, phase } = usePresence(open, duration);
  const gen = useRef(0);
  const wasOpen = useRef(open);
  if (open && !wasOpen.current) gen.current += 1;
  wasOpen.current = open;

  if (!visible) return null;
  const dataPresence = phase === "idle" ? undefined : phase;
  return (
    <div className={className ? `wk-presence ${className}` : "wk-presence"} data-presence={dataPresence}>
      <Fragment key={gen.current}>{children}</Fragment>
    </div>
  );
}
