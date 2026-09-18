import { clamp, easeInOutCubic, lerpPoly, polyBounds, polyPath, centroid, type Point } from "./math";
import { GEO, HIGHLIGHT } from "./geometry";

type BlinkEvent = { at: number; v: number };

export function queueBlink(q: BlinkEvent[], now: number) {
  q.push(
    { at: now, v: 0.08 },
    { at: now + 70, v: 0.08 },
    { at: now + 140, v: 1.05 },
    { at: now + 280, v: 1 },
  );
  if (Math.random() < 0.16) {
    q.push({ at: now + 360, v: 0.08 }, { at: now + 480, v: 1 });
  }
}

export function consumeBlink(q: BlinkEvent[], now: number) {
  let key: number | null = null;
  while (q.length && now >= q[0].at) key = q.shift()!.v;
  return key;
}

export function winkLid(base: number, now: number, winkAt: number, winkEye: number, i: number) {
  let lid = Math.max(base, 0.06);
  if (i === winkEye && now < winkAt + 320) {
    const xr = (now - winkAt) / 320;
    const Fr = xr < 0.42 ? 1 - xr / 0.42 : (xr - 0.42) / 0.58;
    lid = Math.max(lid * clamp(Fr, 0, 1), 0.06);
  }
  return lid;
}

type PaintEyesOptions = {
  now: number;
  polys: [Point[], Point[]];
  blinkX: number;
  winkAt: number;
  winkEye: number;
  gazeX: number;
  gazeY: number;
  eyeEls: SVGPathElement[];
  hlEls: SVGRectElement[];
  clipEls: SVGPathElement[];
  pulse?: number;
};

export function paintEyes(opt: PaintEyesOptions) {
  const {
    now,
    polys,
    blinkX,
    winkAt,
    winkEye,
    gazeX,
    gazeY,
    eyeEls,
    hlEls,
    clipEls,
    pulse = 1,
  } = opt;

  const hl = HIGHLIGHT;

  for (let i = 0; i < 2; i++) {
    const poly = polys[i];
    const bbox = polyBounds(poly);
    const [cx, cy] = centroid(poly);
    const lid = winkLid(blinkX, now, winkAt, winkEye, i);
    const sx = pulse;
    const sy = pulse * lid;

    const jigX = Math.sin(now * 0.00042 + i) * 1.2;
    const jigY = Math.sin(now * 0.00058 + i * 2) * 0.7;
    const dx = gazeX + jigX;
    const dy = gazeY + jigY;
    const eyeTransform =
      `translate(${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}) ` +
      `scale(${sx.toFixed(4)} ${sy.toFixed(4)}) ` +
      `translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`;

    const path = polyPath(poly);
    eyeEls[i].setAttribute("d", path);
    eyeEls[i].setAttribute("transform", eyeTransform);
    clipEls[i].setAttribute("d", path);
    clipEls[i].setAttribute("transform", eyeTransform);

    const widthScale = hl.baseEyeWidth > 0 ? bbox.width / hl.baseEyeWidth : 1;
    const heightScale = hl.baseEyeHeight > 0 ? bbox.height / hl.baseEyeHeight : 1;
    const hlW = hl.size * clamp(widthScale, 0.35, 1.8);
    const hlH = hl.size * clamp(heightScale, 0.35, 1.8);
    const hlX = bbox.minX + bbox.width * hl.anchorX;
    const hlY = bbox.minY + bbox.height * hl.anchorY;

    hlEls[i].setAttribute("x", hlX.toFixed(2));
    hlEls[i].setAttribute("y", hlY.toFixed(2));
    hlEls[i].setAttribute("width", hlW.toFixed(2));
    hlEls[i].setAttribute("height", hlH.toFixed(2));
    const radius = Math.min(hlW, hlH) / 2;
    hlEls[i].setAttribute("rx", radius.toFixed(2));
    hlEls[i].setAttribute("ry", radius.toFixed(2));
    hlEls[i].setAttribute("transform", eyeTransform);

    const visibility = lid < 0.2 ? clamp((lid - 0.06) / 0.14, 0, 1) : 1;
    hlEls[i].style.opacity = String(visibility);
  }
}

export { lerpPoly, easeInOutCubic, GEO };
