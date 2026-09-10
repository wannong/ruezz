import type { PointerEvent as ReactPointerEvent } from "react";

function attachPointerDelta(
  e: ReactPointerEvent<HTMLElement>,
  onMove: (ev: PointerEvent) => void,
): void {
  e.preventDefault();
  const el = e.currentTarget;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* capture optional */
  }
  const move = (ev: globalThis.PointerEvent) => onMove(ev);
  const up = () => {
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
}

export function attachResizeX(
  e: ReactPointerEvent<HTMLElement>,
  onDelta: (dx: number) => void,
): void {
  let last = e.clientX;
  attachPointerDelta(e, (ev) => {
    onDelta(ev.clientX - last);
    last = ev.clientX;
  });
}

export function attachResizeY(
  e: ReactPointerEvent<HTMLElement>,
  onDelta: (dy: number) => void,
): void {
  let last = e.clientY;
  attachPointerDelta(e, (ev) => {
    onDelta(ev.clientY - last);
    last = ev.clientY;
  });
}
