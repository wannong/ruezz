import { type ReactNode, useRef } from "react";
import { X } from "lucide-react";
import { useTabStripIndicator } from "../lib/useTabStripIndicator";

export type TabStripItem = {
  key: string;
  label: ReactNode;
  closeLabel: string;
};

type TabStripProps = {
  items: TabStripItem[];
  activeKey: string | null;
  ariaLabel: string;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
};

export function TabStrip({ items, activeKey, ariaLabel, onSelect, onClose }: TabStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { indicator, ready } = useTabStripIndicator(scrollerRef, activeKey, items.length);

  if (items.length === 0) return <div className="tab-bar empty-tabs" />;

  return (
    <div className="tab-bar" role="tablist" aria-label={ariaLabel} ref={scrollerRef}>
      {indicator && (
        <div
          className={`tab-slide-indicator${ready ? " ready" : ""}`}
          aria-hidden="true"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <div
            key={item.key}
            data-tab-key={item.key}
            className={`tab${active ? " active" : ""}`}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.key)}
          >
            <span className="tab-title">{item.label}</span>
            <button
              type="button"
              className="tab-close"
              data-icon="tab-close"
              aria-label={item.closeLabel}
              onClick={(e) => {
                e.stopPropagation();
                onClose(item.key);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
