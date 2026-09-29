import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from "react";

export type TabStripIndicator = {
  left: number;
  width: number;
};

export function useTabStripIndicator(
  rootRef: RefObject<HTMLElement | null>,
  activeKey: string | null,
  itemCount: number,
) {
  const [indicator, setIndicator] = useState<TabStripIndicator | null>(null);
  const [ready, setReady] = useState(false);

  const updateIndicator = useCallback(() => {
    const root = rootRef.current;
    if (!root || !activeKey) {
      setIndicator(null);
      return;
    }
    const el = root.querySelector(`[data-tab-key="${CSS.escape(activeKey)}"]`);
    if (!(el instanceof HTMLElement)) {
      setIndicator(null);
      return;
    }
    el.scrollIntoView({ inline: "nearest", block: "nearest" });
    setIndicator({
      left: el.offsetLeft,
      width: el.offsetWidth,
    });
  }, [activeKey, rootRef]);

  useLayoutEffect(() => {
    updateIndicator();
    setReady(true);
  }, [updateIndicator, itemCount]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(root);
    for (const tab of root.querySelectorAll<HTMLElement>("[data-tab-key]")) {
      ro.observe(tab);
    }
    root.addEventListener("scroll", updateIndicator, { passive: true });
    window.addEventListener("resize", updateIndicator);
    return () => {
      ro.disconnect();
      root.removeEventListener("scroll", updateIndicator);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator, itemCount, rootRef]);

  return { indicator, ready };
}
