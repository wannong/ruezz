import { useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { tabKey, tabLabel, type Tab } from "../lib/tabs";

type TabBarProps = {
  tabs: Tab[];
  activeKey: string | null;
  titleFor: (id: string) => string;
  isDirty: (id: string) => boolean;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
};

export function TabBar({ tabs, activeKey, titleFor, isDirty, onSelect, onClose }: TabBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    if (!root || !activeKey) return;
    const el = root.querySelector(`[data-tab-key="${CSS.escape(activeKey)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [activeKey, tabs]);

  if (tabs.length === 0) return <div className="tab-bar empty-tabs" />;

  return (
    <div className="tab-bar" role="tablist" ref={scrollerRef}>
      {tabs.map((tab) => {
        const key = tabKey(tab);
        const active = key === activeKey;
        const dirty = isDirty(tab.id);
        return (
          <div
            key={key}
            data-tab-key={key}
            className={`tab${active ? " active" : ""}`}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(key)}
          >
            <button type="button" className="tab-title">
              {dirty && <span className="tab-dirty" title="未保存">●</span>}
              {tabLabel(tab, titleFor)}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label="关闭标签"
              onClick={(e) => {
                e.stopPropagation();
                onClose(key);
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
