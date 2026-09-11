import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRESENCE_MS } from "../lib/usePresence";
import { Presence } from "./Presence";

export type ContextMenuItem =
  | { type: "sep" }
  | { type: "item"; label: string; disabled?: boolean; danger?: boolean; onClick: () => void };

type ContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

type SurfaceProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const snap = useRef({ x, y, items });
  if (open) snap.current = { x, y, items };

  return createPortal(
    <Presence open={open} duration={PRESENCE_MS.fast}>
      <ContextMenuSurface
        x={snap.current.x}
        y={snap.current.y}
        items={snap.current.items}
        onClose={onClose}
      />
    </Presence>,
    document.body,
  );
}

function ContextMenuSurface({ x, y, items, onClose }: SurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y, items]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onBlur = () => onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onBlur);
    window.addEventListener("scroll", onBlur, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onBlur);
      window.removeEventListener("scroll", onBlur, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === "sep" ? (
          <div key={`sep-${i}`} className="ctx-sep" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            type="button"
            role="menuitem"
            className={`ctx-item${item.danger ? " danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
