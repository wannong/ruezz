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
  if (tabs.length === 0) return <div className="tab-bar empty-tabs" />;

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => {
        const key = tabKey(tab);
        const active = key === activeKey;
        const dirty = isDirty(tab.id);
        return (
          <div key={key} className={`tab${active ? " active" : ""}`} role="tab" aria-selected={active}>
            <button type="button" className="tab-title" onClick={() => onSelect(key)}>
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
