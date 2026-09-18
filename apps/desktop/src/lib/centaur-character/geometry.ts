/* ORIGINAL Centaur geometry — cream plate, gray head, capsule eye polygons. */
import {
  capsulePoly,
  mapPoly,
  offsetPoly,
  polyBounds,
  resampleClosed,
  scalePoly,
  shearPoly,
  type Point,
} from "./math";

export const COLORS = {
  plate: "#F6F3EE",
  head: "#D6D3D1",
  eye: "#1C1917",
  highlight: "#F6F3EE",
};

export const VIEW = { minX: 0, minY: 0, width: 256, height: 256 };
export const N = 24;

export const LEFT = { x: 78, y: 98, w: 36, h: 52 };
export const RIGHT = { x: 142, y: 98, w: 36, h: 52 };
const HL_L = { x: 86, y: 106, s: 12 };
const HL_R = { x: 150, y: 106, s: 12 };

const baseL = capsulePoly(LEFT.x, LEFT.y, LEFT.w, LEFT.h, N);
const baseR = capsulePoly(RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h, N);

function thinLid(base: Point[], open = 0.12, dy = 0) {
  const mid = scalePoly(base, 1.05, open);
  return offsetPoly(mid, 0, dy);
}

function happyCurve(base: Point[], side: number) {
  const thin = scalePoly(base, 1.08, 0.28);
  return mapPoly(thin, (x, y, cx, cy) => {
    const lx = x - cx;
    const bow = -Math.abs(lx) * 0.08 * side;
    return [x, cy + (y - cy) + bow - 2];
  });
}

function wideEye(base: Point[]) {
  return scalePoly(base, 1.12, 1.22);
}

function sleepy(base: Point[]) {
  return mapPoly(base, (x, y, _cx, cy) => {
    const ly = y - cy;
    const topPull = ly < 0 ? ly * 0.35 : ly;
    return [x, cy + topPull + 4];
  });
}

function angryV(base: Point[], side: number) {
  return mapPoly(base, (x, y, cx, cy) => {
    const lx = x - cx;
    const ly = y - cy;
    const inward = side * lx * 0.12;
    const topSkew = ly < 0 ? -side * lx * 0.18 : 0;
    return [cx + lx * 0.92 + inward * 0.3, cy + ly * 0.78 + topSkew + 2];
  });
}

function lookBias(base: Point[], dx: number) {
  return scalePoly(offsetPoly(base, dx, 0), 0.95, 1.0);
}

function sadDroop(base: Point[], side: number) {
  return mapPoly(base, (x, y, cx, cy) => {
    const lx = x - cx;
    const ly = y - cy;
    const droop = side * lx * 0.1;
    return [cx + lx * 0.95, cy + ly * 0.85 + Math.abs(lx) * 0.06 + droop * 0.2 + 3];
  });
}

function suspicious(base: Point[]) {
  return scalePoly(offsetPoly(base, 0, 2), 1.0, 0.42);
}

function roundSurprise(base: Point[]) {
  return scalePoly(base, 1.15, 0.95);
}

function thinkingRaise(base: Point[], raise: number) {
  return offsetPoly(scalePoly(base, 0.98, 0.88), 0, raise);
}

function bored(base: Point[]) {
  return scalePoly(offsetPoly(base, 0, 3), 1.02, 0.55);
}

function proud(base: Point[]) {
  return scalePoly(offsetPoly(base, 0, -1), 1.02, 0.72);
}

function scaredEye(base: Point[]) {
  return scalePoly(base, 1.18, 1.28);
}

function softSmile(base: Point[]) {
  return scalePoly(offsetPoly(base, 0, 1), 1.06, 0.48);
}

function confusedTilt(base: Point[], side: number) {
  return shearPoly(scalePoly(base, 1.0, 0.9), 0.08 * side, 0);
}

function playfulWink(base: Point[], closed: boolean) {
  return closed ? thinLid(base, 0.1, 2) : scalePoly(base, 1.05, 1.08);
}

type Expression = { id: string; pair: [Point[], Point[]] };

export const EXPRESSIONS: Expression[] = [
  { id: "normal", pair: [baseL, baseR] },
  { id: "blink", pair: [thinLid(baseL, 0.1, 2), thinLid(baseR, 0.1, 2)] },
  { id: "happy", pair: [happyCurve(baseL, 1), happyCurve(baseR, -1)] },
  { id: "wide", pair: [wideEye(baseL), wideEye(baseR)] },
  { id: "sleepy", pair: [sleepy(baseL), sleepy(baseR)] },
  { id: "angry", pair: [angryV(baseL, 1), angryV(baseR, -1)] },
  { id: "lookLeft", pair: [lookBias(baseL, -6), lookBias(baseR, -6)] },
  { id: "lookRight", pair: [lookBias(baseL, 6), lookBias(baseR, 6)] },
  { id: "winkL", pair: [thinLid(baseL, 0.08, 2), scalePoly(baseR, 1.02, 1.05)] },
  { id: "winkR", pair: [scalePoly(baseL, 1.02, 1.05), thinLid(baseR, 0.08, 2)] },
  { id: "soft", pair: [softSmile(baseL), softSmile(baseR)] },
  { id: "surprise", pair: [roundSurprise(baseL), roundSurprise(baseR)] },
  { id: "sad", pair: [sadDroop(baseL, 1), sadDroop(baseR, -1)] },
  { id: "thinking", pair: [thinkingRaise(baseL, 1), thinkingRaise(baseR, -3)] },
  { id: "suspicious", pair: [suspicious(baseL), suspicious(baseR)] },
  { id: "bored", pair: [bored(baseL), bored(baseR)] },
  { id: "scared", pair: [scaredEye(baseL), scaredEye(baseR)] },
  { id: "proud", pair: [proud(baseL), proud(baseR)] },
  { id: "confused", pair: [confusedTilt(baseL, 1), confusedTilt(baseR, -1)] },
  { id: "playful", pair: [playfulWink(baseL, true), playfulWink(baseR, false)] },
];

for (const e of EXPRESSIONS) {
  e.pair[0] = resampleClosed(e.pair[0], N);
  e.pair[1] = resampleClosed(e.pair[1], N);
}

export const EYE_BY_ID = Object.fromEntries(EXPRESSIONS.map((e, i) => [e.id, i])) as Record<
  string,
  number
>;

function roundedRectPath(x: number, y: number, w: number, h: number, rx: number) {
  const r = Math.min(rx, w / 2, h / 2);
  return [
    `M${x + r} ${y}`,
    `H${x + w - r}`,
    `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join("");
}

export const HEAD = {
  x: 48,
  y: 54,
  w: 160,
  h: 148,
  rx: 48,
  path: roundedRectPath(48, 54, 160, 148, 48),
};

export const PLATE = { w: 256, h: 256, rx: 56 };

const baseEyeBounds = polyBounds(baseL);
export const HIGHLIGHT = {
  fill: COLORS.highlight,
  size: 12,
  anchorX: 0.22,
  anchorY: 0.18,
  baseEyeWidth: baseEyeBounds.width,
  baseEyeHeight: baseEyeBounds.height,
  source: { left: HL_L, right: HL_R },
};

export const GEO = {
  COLORS,
  VIEW,
  N,
  EXPRESSIONS,
  EYE_BY_ID,
  HEAD,
  PLATE,
  HIGHLIGHT,
  LEFT,
  RIGHT,
  baseL,
  baseR,
};
