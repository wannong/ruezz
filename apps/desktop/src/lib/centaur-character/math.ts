/* Centaur spring math — patterns adapted from public animation studies; original code. */

export type Spring = { x: number; v: number; t: number };
export type Point = [number, number];

export const spring = (x: number): Spring => ({ x, v: 0, t: x });

export const stepSpring = (s: Spring, freq: number, damp: number, dt: number) => {
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - s.t)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = s.t;
    s.v = 0;
  }
};

export const DT = 1 / 120;
export const springSteps = (dt: number) => Math.max(1, Math.ceil(dt / DT));
export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const sign = () => (Math.random() < 0.5 ? -1 : 1);
export const smoothstep = (n: number) => n * n * (3 - 2 * n);
export const easeInOutCubic = (n: number) =>
  n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;

export const polyPath = (pts: Point[]) =>
  "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L") + "Z";

export const centroid = (pts: Point[]): Point => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
};

export const polyBounds = (pts: Point[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
};

export const lerpPoly = (a: Point[], b: Point[], t: number): Point[] =>
  a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);

export function capsulePoly(x: number, y: number, w: number, h: number, n = 24): Point[] {
  const r = w / 2;
  const cx = x + r;
  const topCy = y + r;
  const botCy = y + h - r;
  const pts: Point[] = [];
  const arcN = Math.max(4, Math.floor(n / 2));
  for (let i = 0; i <= arcN; i++) {
    const a = Math.PI + (Math.PI * i) / arcN;
    pts.push([cx + r * Math.cos(a), topCy + r * Math.sin(a)]);
  }
  for (let i = 1; i <= arcN; i++) {
    const a = (Math.PI * i) / arcN;
    pts.push([cx + r * Math.cos(a), botCy + r * Math.sin(a)]);
  }
  return resampleClosed(pts, n);
}

export function resampleClosed(pts: Point[], n: number): Point[] {
  if (pts.length === n) return pts.map((p) => [p[0], p[1]]);
  const closed = pts.concat([pts[0]]);
  let total = 0;
  const seg: number[] = [];
  for (let i = 0; i < closed.length - 1; i++) {
    const d = Math.hypot(closed[i + 1][0] - closed[i][0], closed[i + 1][1] - closed[i][1]);
    seg.push(d);
    total += d;
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    let target = (i / n) * total;
    let acc = 0;
    for (let s = 0; s < seg.length; s++) {
      if (acc + seg[s] >= target || s === seg.length - 1) {
        const t = seg[s] < 1e-9 ? 0 : (target - acc) / seg[s];
        out.push([
          closed[s][0] + (closed[s + 1][0] - closed[s][0]) * t,
          closed[s][1] + (closed[s + 1][1] - closed[s][1]) * t,
        ]);
        break;
      }
      acc += seg[s];
    }
  }
  return out;
}

export function mapPoly(
  pts: Point[],
  fn: (x: number, y: number, cx: number, cy: number) => Point,
): Point[] {
  const [cx, cy] = centroid(pts);
  return pts.map((p) => fn(p[0], p[1], cx, cy));
}

export function scalePoly(pts: Point[], sx: number, sy: number): Point[] {
  return mapPoly(pts, (x, y, cx, cy) => [cx + (x - cx) * sx, cy + (y - cy) * sy]);
}

export function offsetPoly(pts: Point[], dx: number, dy: number): Point[] {
  return pts.map((p) => [p[0] + dx, p[1] + dy]);
}

export function shearPoly(pts: Point[], kx: number, ky: number): Point[] {
  return mapPoly(pts, (x, y, cx, cy) => {
    const lx = x - cx;
    const ly = y - cy;
    return [cx + lx + kx * ly, cy + ly + ky * lx];
  });
}
