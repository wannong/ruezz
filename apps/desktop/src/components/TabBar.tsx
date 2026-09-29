import { useMemo } from "react";
import { tabKey, tabLabel, type Tab } from "../lib/tabs";
import { TabStrip, type TabStripItem } from "./TabStrip";

type TabBarProps = {
  tabs: Tab[];
  activeKey: string | null;
  titleFor: (id: string) => string;
  isDirty: (id: string) => boolean;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
};

export function TabBar({ tabs, activeKey, titleFor, isDirty, onSelect, onClose }: TabBarProps) {
  const items = useMemo<TabStripItem[]>(
    () =>
      tabs.map((tab) => {
        const key = tabKey(tab);
        const label = tabLabel(tab, titleFor);
        const dirty = isDirty(tab.id);
        return {
          key,
          label: (
            <>
              {dirty && <span className="tab-dirty" title="未保存">●</span>}
              {label}
            </>
          ),
          closeLabel: "关闭标签",
        };
      }),
    [tabs, titleFor, isDirty],
  );

  return (
    <TabStrip
      items={items}
      activeKey={activeKey}
      ariaLabel="已打开页面"
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
