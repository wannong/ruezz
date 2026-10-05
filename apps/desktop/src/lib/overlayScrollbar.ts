/** Keep thumb visible briefly after scrolling, then let CSS fade-out run. */
const SCROLLBAR_HIDE_MS = 1000;

const timeouts = new WeakMap<EventTarget, number>();

/** Reveal native scrollbars briefly while the user is scrolling. */
export function installOverlayScrollbars(): void {
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      target.classList.add("is-scrolling");
      const prev = timeouts.get(target);
      if (prev !== undefined) window.clearTimeout(prev);
      timeouts.set(
        target,
        window.setTimeout(() => {
          target.classList.remove("is-scrolling");
          timeouts.delete(target);
        }, SCROLLBAR_HIDE_MS),
      );
    },
    true,
  );
}
