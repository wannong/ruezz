const SCROLLBAR_TRACK = 24;

function scrollbarGutter(el: HTMLElement): { x: number; y: number } {
  return {
    x: Math.max(0, el.offsetWidth - el.clientWidth),
    y: Math.max(0, el.offsetHeight - el.clientHeight),
  };
}

function containsPoint(el: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function overflowAllowsScroll(style: CSSStyleDeclaration, axis: "x" | "y"): boolean {
  const value = axis === "x" ? style.overflowX : style.overflowY;
  return value === "auto" || value === "scroll" || value === "overlay";
}

function hasHorizontalOverflow(el: HTMLElement): boolean {
  return el.scrollWidth - el.clientWidth > 0.5;
}

function hasVerticalOverflow(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 0.5;
}

function isScrollableElement(el: HTMLElement): boolean {
  return hasHorizontalOverflow(el) || hasVerticalOverflow(el);
}

function horizontalTrackHeight(el: HTMLElement): number {
  const gutter = scrollbarGutter(el).y;
  if (gutter > 0) return gutter;
  if (!hasHorizontalOverflow(el)) return 0;
  const style = getComputedStyle(el);
  if (!overflowAllowsScroll(style, "x")) return 0;
  return SCROLLBAR_TRACK;
}

function verticalTrackWidth(el: HTMLElement): number {
  const gutter = scrollbarGutter(el).x;
  if (gutter > 0) return gutter;
  if (!hasVerticalOverflow(el)) return 0;
  const style = getComputedStyle(el);
  if (!overflowAllowsScroll(style, "y")) return 0;
  return SCROLLBAR_TRACK;
}

/** True when the pointer is on a native scrollbar track/thumb for this element. */
export function isPointerOnScrollbar(el: HTMLElement, clientX: number, clientY: number): boolean {
  if (!containsPoint(el, clientX, clientY)) return false;

  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const hTrack = horizontalTrackHeight(el);
  if (hTrack > 0 && y >= rect.height - hTrack) return true;

  const vTrack = verticalTrackWidth(el);
  return vTrack > 0 && x >= rect.width - vTrack;
}

export function scrollablesUnderPointer(
  target: HTMLElement | null,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const result: HTMLElement[] = [];

  const push = (el: HTMLElement) => {
    if (seen.has(el) || !isScrollableElement(el)) return;
    seen.add(el);
    result.push(el);
  };

  push(rendered);

  let el: HTMLElement | null = target;
  while (el) {
    push(el);
    if (el === rendered) break;
    el = el.parentElement;
    if (el && !rendered.contains(el)) break;
  }

  const stack = [rendered];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const child of node.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (containsPoint(child, clientX, clientY)) push(child);
      stack.push(child);
    }
  }

  return result;
}

/** Let the browser keep scrollbar interactions instead of entering preview edit mode. */
export function shouldYieldToPreviewScroll(
  target: HTMLElement | null,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  if (!containsPoint(rendered, clientX, clientY)) return false;
  return scrollablesUnderPointer(target, rendered, clientX, clientY).some((el) =>
    isPointerOnScrollbar(el, clientX, clientY),
  );
}

export function pointerOnPreviewScrollbar(
  target: HTMLElement | null,
  rendered: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  return shouldYieldToPreviewScroll(target, rendered, clientX, clientY);
}

export function stopPreviewScrollEventPropagation(
  wrap: HTMLElement,
  event: MouseEvent,
): boolean {
  const target = event.target as HTMLElement | null;
  if (!shouldYieldToPreviewScroll(target, wrap, event.clientX, event.clientY)) return false;
  event.stopPropagation();
  return true;
}
