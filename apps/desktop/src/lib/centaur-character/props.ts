import {
  clamp,
  lerp,
  polyPath,
  smoothstep,
  spring,
  stepSpring,
  springSteps,
  type Point,
  type Spring,
} from "./math";
import { GEO } from "./geometry";
import { SPRINGS, type CentaurActivity } from "./tables";

const NS = "http://www.w3.org/2000/svg";
const C = GEO.COLORS;
const LINE_W = 3;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> | null,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function makeHand(parent: SVGElement) {
  return el(
    "rect",
    { x: -11, y: -9, width: 22, height: 18, rx: 9, fill: C.head, stroke: C.line, "stroke-width": LINE_W },
    parent,
  );
}

function setXform(node: SVGElement, x: number, y: number, rot = 0, s = 1) {
  let tf = `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
  if (rot) tf += ` rotate(${rot.toFixed(2)})`;
  if (s !== 1) tf += ` scale(${s.toFixed(4)})`;
  node.setAttribute("transform", tf);
}

const bump = (u: number) => {
  const s = Math.sin(Math.PI * clamp(u, 0, 1));
  return s * s;
};

type SchedulePhase = { name: string; ms: number; start: number };
type Schedule = { phases: SchedulePhase[]; total: number };

function makeSchedule(list: Array<{ name: string; ms: number }>): Schedule {
  let total = 0;
  const phases = list.map((p) => {
    const out = { name: p.name, ms: p.ms, start: total };
    total += p.ms;
    return out;
  });
  return { phases, total };
}

function phaseOf(clock: number, schedule: Schedule) {
  const t = ((clock % schedule.total) + schedule.total) % schedule.total;
  for (const p of schedule.phases) {
    if (t < p.start + p.ms) return { name: p.name, u: (t - p.start) / p.ms };
  }
  const last = schedule.phases[schedule.phases.length - 1];
  return { name: last.name, u: 0.999999 };
}

const lerpPt = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

const SPINE_X = 128;
const pageQuad = (ox: number, lift = 0): Point[] => [
  [SPINE_X, 180],
  [ox, 186 - lift],
  [ox, 226 - lift],
  [SPINE_X, 222],
];

const quadPoint = (q: Point[], a: number, v: number) => lerpPt(lerpPt(q[0], q[1], a), lerpPt(q[3], q[2], a), v);

const TEXT_V = [0.22, 0.4, 0.58, 0.76];
const LEFT_LEN = [0.95, 0.78, 1.0, 0.72];
const RIGHT_LEN = [0.86, 1.0, 0.74, 0.92];
const LEFT_SPANS = TEXT_V.map((v, k) => [0.88, 0.88 - 0.76 * LEFT_LEN[k], v] as [number, number, number]);
const RIGHT_SPANS = TEXT_V.map((v, k) => [0.12, 0.12 + 0.76 * RIGHT_LEN[k], v] as [number, number, number]);

function makeTextLines(parent: SVGElement) {
  return TEXT_V.map(() =>
    el(
      "line",
      { stroke: C.line, "stroke-opacity": 0.35, "stroke-width": 2.5, "stroke-linecap": "round" },
      parent,
    ),
  );
}

function placeTextLines(lines: SVGLineElement[], spans: Array<[number, number, number]>, quad: Point[]) {
  lines.forEach((ln, k) => {
    const [a0, a1, v] = spans[k];
    const p0 = quadPoint(quad, a0, v);
    const p1 = quadPoint(quad, a1, v);
    ln.setAttribute("x1", p0[0].toFixed(2));
    ln.setAttribute("y1", p0[1].toFixed(2));
    ln.setAttribute("x2", p1[0].toFixed(2));
    ln.setAttribute("y2", p1[1].toFixed(2));
  });
}

const READING_SCHEDULE = makeSchedule([
  { name: "line0", ms: 1500 },
  { name: "line1", ms: 1500 },
  { name: "line2", ms: 1500 },
  { name: "line3", ms: 1500 },
  { name: "flip", ms: 1200 },
]);

const paperStroke = {
  fill: C.paper,
  stroke: C.line,
  "stroke-width": LINE_W,
  "stroke-linejoin": "round",
};

type MotionOut = {
  tilt: number;
  ty: number;
  squash: number;
  gaze: { x: number; y: number } | null;
  eye: string | null;
};

type ActivityParts = Record<string, unknown>;

type ActivityDef = {
  enter: "below" | "above";
  build: (gEl: SVGGElement) => ActivityParts;
  motion: (clock: number) => MotionOut;
  paint: (clock: number, parts: ActivityParts) => void;
};

const reading: ActivityDef = {
  enter: "below",
  build(gEl) {
    el(
      "path",
      {
        d: "M128 176L66 182L66 230L128 226L190 230L190 182Z",
        fill: C.accent,
        stroke: C.line,
        "stroke-width": LINE_W,
        "stroke-linejoin": "round",
      },
      gEl,
    );
    const leftQ = pageQuad(70);
    const rightQ = pageQuad(186);
    el("path", { d: polyPath(leftQ), ...paperStroke }, gEl);
    el("path", { d: polyPath(rightQ), ...paperStroke }, gEl);
    placeTextLines(makeTextLines(gEl) as SVGLineElement[], LEFT_SPANS, leftQ);
    placeTextLines(makeTextLines(gEl) as SVGLineElement[], RIGHT_SPANS, rightQ);

    const leafG = el("g", { opacity: 0 }, gEl);
    const leaf = el("path", paperStroke, leafG);
    const frontG = el("g", null, leafG);
    const backG = el("g", null, leafG);
    const front = makeTextLines(frontG) as SVGLineElement[];
    const back = makeTextLines(backG) as SVGLineElement[];
    const handL = makeHand(gEl);
    const handR = makeHand(gEl);
    return { leafG, leaf, frontG, backG, front, back, handL, handR };
  },
  motion(clock) {
    const { name, u } = phaseOf(clock, READING_SCHEDULE);
    const m: MotionOut = { tilt: 0, ty: 0, squash: 0, gaze: { x: 0, y: 5 }, eye: "reading" };
    if (name === "line0" || name === "line1") {
      m.gaze = { x: lerp(-9, -1, u), y: 5 };
    } else if (name === "line2" || name === "line3") {
      m.gaze = { x: lerp(1, 9, u), y: 5 };
      if (name === "line2") {
        m.ty += 4 * bump(u);
        m.squash += -0.02 * bump(u);
      }
    } else {
      m.gaze = { x: lerp(8, -8, smoothstep(u)), y: 3 };
      m.ty += 3 * bump((u - 0.5) * 2);
      if (u > 0.6) m.eye = "soft";
    }
    return m;
  },
  paint(clock, parts) {
    const breathe = Math.sin(clock * 0.002) * 1.5;
    setXform(parts.handL as SVGElement, 66, 216 + breathe);
    setXform(parts.handR as SVGElement, 190, 216 + breathe);

    const { name, u } = phaseOf(clock, READING_SCHEDULE);
    if (name !== "flip") {
      (parts.leafG as SVGElement).setAttribute("opacity", "0");
      return;
    }
    const s = smoothstep(u);
    const ox = SPINE_X + 58 * Math.cos(Math.PI * s);
    const lift = 10 * Math.sin(Math.PI * s);
    const q = pageQuad(ox, lift);
    (parts.leafG as SVGElement).setAttribute("opacity", "1");
    (parts.leaf as SVGPathElement).setAttribute("d", polyPath(q));
    const showFront = s < 0.5;
    (parts.frontG as SVGElement).setAttribute("opacity", showFront ? "1" : "0");
    (parts.backG as SVGElement).setAttribute("opacity", showFront ? "0" : "1");
    placeTextLines(parts.front as SVGLineElement[], showFront ? RIGHT_SPANS : LEFT_SPANS, q);
  },
};

const BEAT_MS = 600;
const sstep = (n: number) => smoothstep(clamp(n, 0, 1));
const beatPulse = (ph: number) => Math.pow(Math.max(0, Math.cos(2 * Math.PI * ph)), 4);

function tapLift(ph: number) {
  const f = ph - Math.floor(ph);
  if (f < 0.35) return 1 - sstep(f / 0.35);
  if (f > 0.85) return sstep((f - 0.85) / 0.15);
  return 0;
}

function makeEarCup(parent: SVGElement, side: number) {
  const cupG = el("g", null, parent);
  el("rect", { x: -11, y: -23, width: 22, height: 46, rx: 10, fill: C.line }, cupG);
  el(
    "rect",
    { x: side < 0 ? 3 : -9, y: -17, width: 6, height: 34, rx: 3, fill: C.accent },
    cupG,
  );
  return cupG;
}

const music: ActivityDef = {
  enter: "above",
  build(gEl) {
    el(
      "path",
      {
        d: "M44 124C44 36 212 36 212 124",
        fill: "none",
        stroke: C.line,
        "stroke-width": 9,
        "stroke-linecap": "round",
      },
      gEl,
    );
    const cupL = makeEarCup(gEl, -1);
    const cupR = makeEarCup(gEl, 1);
    const handL = makeHand(gEl);
    const handR = makeHand(gEl);
    return { cupL, cupR, handL, handR };
  },
  motion(clock) {
    const ph = clock / BEAT_MS;
    const b = beatPulse(ph);
    return {
      tilt: 7 * Math.sin(Math.PI * ph),
      ty: 3 * b,
      squash: -0.025 * b,
      gaze: null,
      eye: null,
    };
  },
  paint(clock, parts) {
    const ph = clock / BEAT_MS;
    const s = 1 + 0.06 * beatPulse(ph);
    setXform(parts.cupL as SVGElement, 41, 123, 0, s);
    setXform(parts.cupR as SVGElement, 215, 123, 0, s);
    setXform(parts.handR as SVGElement, 196, 224 - 7 * tapLift(ph));
    setXform(parts.handL as SVGElement, 60, 224 - 4 * tapLift(ph + 0.5));
  },
};

const WRITING_SCHEDULE = makeSchedule([
  { name: "write0", ms: 1600 },
  { name: "write1", ms: 1600 },
  { name: "write2", ms: 1600 },
  { name: "think", ms: 1800 },
  { name: "write3", ms: 1600 },
  { name: "done", ms: 1400 },
]);
const WRITE_PHASES = ["write0", "write1", "write2", "write3"];
const PHASE_START: Record<string, SchedulePhase> = {};
WRITING_SCHEDULE.phases.forEach((p) => {
  PHASE_START[p.name] = p;
});

const INK_LINES = [0, 1, 2, 3].map((k) => {
  const pts: Point[] = [];
  for (let x = 86; x <= 176; x += 3) {
    pts.push([x, 194 + 9 * k + Math.sin(x * 0.45 + k) * 2.2]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const d = "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L");
  return { pts, cum, len: cum[cum.length - 1], d };
});

function inkPoint(line: (typeof INK_LINES)[number], s: number): Point {
  const target = clamp(s, 0, 1) * line.len;
  let i = 1;
  while (i < line.cum.length - 1 && line.cum[i] < target) i++;
  const seg = line.cum[i] - line.cum[i - 1];
  const t = seg > 0 ? (target - line.cum[i - 1]) / seg : 0;
  return lerpPt(line.pts[i - 1], line.pts[i], clamp(t, 0, 1));
}

const backOut = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const NB_TOP = 184;
const NB_BOT = 230;
const nbEdgeX = (y: number, side: number) => {
  const v = (y - NB_TOP) / (NB_BOT - NB_TOP);
  return side < 0 ? lerp(78, 66, v) : lerp(186, 198, v);
};
const THINK_LIFT: Point = [190, 168];
const HAND_GRIP: Point = [12, -10];
const SCRATCH_HAND: Point = [200, 74];
const RETURN_U = 0.15;
const hasReturn = (k: number) => k === 1 || k === 2;
const rowProgress = (k: number, u: number) => (hasReturn(k) ? clamp((u - RETURN_U) / (1 - RETURN_U), 0, 1) : u);

type WritingState = {
  name: string;
  u: number;
  t: number;
  progress: number[];
  ink: number;
  wobble: number;
  headW: number;
  tip: Point;
};

function writingState(clock: number): WritingState {
  const total = WRITING_SCHEDULE.total;
  const t = ((clock % total) + total) % total;
  const { name, u } = phaseOf(clock, WRITING_SCHEDULE);
  const progress = WRITE_PHASES.map((p, k) =>
    rowProgress(k, clamp((t - PHASE_START[p].start) / PHASE_START[p].ms, 0, 1)),
  );
  const st: WritingState = { name, u, t, progress, ink: 1, wobble: 1, headW: 0, tip: [128, 200] };
  if (name === "think") {
    const end2 = inkPoint(INK_LINES[2], 1);
    const start3 = inkPoint(INK_LINES[3], 0);
    const head: Point = [SCRATCH_HAND[0] - HAND_GRIP[0], SCRATCH_HAND[1] - HAND_GRIP[1]];
    st.headW = sstep((u - 0.25) / 0.12) * (1 - sstep((u - 0.63) / 0.12));
    let tip: Point;
    if (u < 0.25) tip = lerpPt(end2, THINK_LIFT, sstep(u / 0.25));
    else if (u < 0.75) tip = lerpPt(THINK_LIFT, head, st.headW);
    else tip = lerpPt(THINK_LIFT, start3, sstep((u - 0.75) / 0.25));
    st.tip = tip;
    st.wobble = 1 - bump(u);
  } else if (name === "done") {
    st.ink = 1 - sstep(u);
    st.tip = lerpPt(inkPoint(INK_LINES[3], 1), inkPoint(INK_LINES[0], 0), sstep(u));
  } else {
    const k = WRITE_PHASES.indexOf(name);
    if (hasReturn(k) && u < RETURN_U) {
      st.tip = lerpPt(inkPoint(INK_LINES[k - 1], 1), inkPoint(INK_LINES[k], 0), sstep(u / RETURN_U));
    } else {
      st.tip = inkPoint(INK_LINES[k], progress[k]);
    }
  }
  return st;
}

function makeQuill(parent: SVGElement) {
  const qG = el("g", null, parent);
  el(
    "path",
    {
      d: "M14 0C22 -9 42 -11 56 -5C46 -1 30 3 14 0Z",
      fill: C.accent,
      stroke: C.line,
      "stroke-width": 2.5,
      "stroke-linejoin": "round",
    },
    qG,
  );
  el("line", { x1: 3, y1: 0, x2: 58, y2: -3, stroke: C.line, "stroke-width": 2.5, "stroke-linecap": "round" }, qG);
  el("path", { d: "M0 0L6 -2.2L6 2.2Z", fill: C.line }, qG);
  return qG;
}

const writing: ActivityDef = {
  enter: "below",
  build(gEl) {
    el(
      "path",
      {
        d: `M78 ${NB_TOP}L186 ${NB_TOP}L198 ${NB_BOT}L66 ${NB_BOT}Z`,
        fill: C.paper,
        stroke: C.line,
        "stroke-width": LINE_W,
        "stroke-linejoin": "round",
      },
      gEl,
    );
    for (const y of [198, 207, 216]) {
      el(
        "line",
        {
          x1: (nbEdgeX(y, -1) + 5).toFixed(2),
          y1: y,
          x2: (nbEdgeX(y, 1) - 5).toFixed(2),
          y2: y,
          stroke: C.line,
          "stroke-opacity": 0.15,
          "stroke-width": 1.5,
        },
        gEl,
      );
    }
    const inkG = el("g", null, gEl);
    const inks = INK_LINES.map((ln) =>
      el(
        "path",
        {
          d: ln.d,
          fill: "none",
          stroke: C.line,
          "stroke-width": 2.2,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-dasharray": `${ln.len.toFixed(2)} ${(ln.len + 8).toFixed(2)}`,
          "stroke-dashoffset": ln.len.toFixed(2),
          visibility: "hidden",
        },
        inkG,
      ),
    );
    const dots = INK_LINES.map(() => el("circle", { r: 2.5, fill: C.line }, inkG));
    const handL = makeHand(gEl);
    setXform(handL, 80, 216);
    const quill = makeQuill(gEl);
    const handW = makeHand(gEl);
    return { inkG, inks, dots, quill, handW };
  },
  motion(clock) {
    const st = writingState(clock);
    const tipX = st.tip[0];
    const m: MotionOut = { tilt: (tipX - 128) / 40, ty: 0, squash: 0, gaze: null, eye: "focus" };
    if (st.name === "think") {
      m.gaze = { x: 4, y: -5 };
      m.tilt += 6 * bump(st.u);
      m.ty += -2 * bump(st.u);
      m.eye = "thinking";
    } else {
      m.gaze = { x: clamp((tipX - 128) / 8, -9, 9), y: 6 };
      if (st.name === "done") m.eye = "soft";
    }
    return m;
  },
  paint(clock, parts) {
    const st = writingState(clock);
    const inks = parts.inks as SVGPathElement[];
    const dots = parts.dots as SVGCircleElement[];
    (parts.inkG as SVGElement).setAttribute("opacity", st.ink.toFixed(3));
    INK_LINES.forEach((ln, k) => {
      const p = st.progress[k];
      const ink = inks[k];
      ink.setAttribute("visibility", p > 0 ? "visible" : "hidden");
      ink.setAttribute("stroke-dashoffset", (ln.len * (1 - p)).toFixed(2));
      const doneAt = PHASE_START[WRITE_PHASES[k]].start + PHASE_START[WRITE_PHASES[k]].ms;
      const since = st.t - doneAt;
      const end = ln.pts[ln.pts.length - 1];
      const dot = dots[k];
      if (since < 0) {
        dot.setAttribute("visibility", "hidden");
      } else {
        dot.setAttribute("visibility", "visible");
        setXform(dot, end[0] + 4, end[1], 0, Math.max(0.001, backOut(Math.min(since / 260, 1))));
      }
    });
    const w = st.wobble;
    let x = st.tip[0] + Math.sin(clock * 0.05) * 1.5 * w;
    const y = st.tip[1] + Math.cos(clock * 0.07) * 1.5 * w;
    x += Math.sin(clock * 0.03) * 3 * st.headW;
    setXform(parts.quill as SVGElement, x, y, -35);
    setXform(parts.handW as SVGElement, x + HAND_GRIP[0], y + HAND_GRIP[1]);
  },
};

const TEA_SCHEDULE = makeSchedule([
  { name: "hold", ms: 3000 },
  { name: "sip", ms: 1600 },
  { name: "ahh", ms: 1400 },
]);
const STEAM_X = [116, 128, 140];
const STEAM_TOP = 146;
const STEAM_BOT = 176;
const STEAM_LOOP_MS = 1800;
const MUG_PIVOT: Point = [128, 200];

function steamPath(x0: number, clock: number, k: number) {
  let d = "";
  for (let y = STEAM_BOT; y >= STEAM_TOP; y -= 3) {
    const a = 1 + 2 * (STEAM_BOT - y) / (STEAM_BOT - STEAM_TOP);
    const x = x0 + Math.sin(y * 0.22 + clock * 0.006 + k * 2.1) * a;
    d += `${d ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

const tea: ActivityDef = {
  enter: "below",
  build(gEl) {
    const steam = STEAM_X.map(() =>
      el(
        "path",
        {
          fill: "none",
          stroke: C.line,
          "stroke-width": 2.5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          opacity: 0,
        },
        gEl,
      ),
    );
    const mugG = el("g", null, gEl);
    el(
      "path",
      {
        d: "M146 190C164 188 166 214 146 212",
        fill: "none",
        stroke: C.line,
        "stroke-width": 6,
        "stroke-linecap": "round",
      },
      mugG,
    );
    el(
      "rect",
      { x: 106, y: 182, width: 44, height: 38, rx: 8, fill: C.accent, stroke: C.line, "stroke-width": LINE_W },
      mugG,
    );
    el("ellipse", { cx: 128, cy: 188, rx: 16, ry: 3.5, fill: C.line, "fill-opacity": 0.5 }, mugG);
    const handL = makeHand(mugG);
    const handR = makeHand(mugG);
    setXform(handL, 100, 206);
    setXform(handR, 156, 206);
    return { steam, mugG };
  },
  motion(clock) {
    const { name, u } = phaseOf(clock, TEA_SCHEDULE);
    const m: MotionOut = { tilt: 0, ty: 0, squash: 0, gaze: null, eye: null };
    if (name === "hold") {
      m.gaze = { x: 0, y: 4 };
    } else if (name === "sip") {
      m.tilt += -3 * bump(u);
      m.ty += -2 * bump(u);
      m.eye = "happy";
    } else {
      m.squash += -0.03 * bump(u);
      m.ty += 2 * bump(u);
      m.eye = "soft";
    }
    return m;
  },
  paint(clock, parts) {
    const { name, u } = phaseOf(clock, TEA_SCHEDULE);
    const sip = name === "sip" ? bump(u) : 0;
    const [px, py] = MUG_PIVOT;
    (parts.mugG as SVGElement).setAttribute(
      "transform",
      `translate(${px} ${(py - 16 * sip).toFixed(2)}) rotate(${(-14 * sip).toFixed(2)}) translate(${-px} ${-py})`,
    );
    (parts.steam as SVGPathElement[]).forEach((wisp, k) => {
      const local = (clock / STEAM_LOOP_MS + k / 3) % 1;
      wisp.setAttribute("d", steamPath(STEAM_X[k], clock, k));
      wisp.setAttribute("opacity", (0.35 * bump(local) * (1 - sip)).toFixed(3));
    });
  },
};

const STRETCH_SCHEDULE = makeSchedule([
  { name: "reach", ms: 1400 },
  { name: "yawn", ms: 1800 },
  { name: "relax", ms: 1200 },
  { name: "rest", ms: 2000 },
]);
const REST_L: Point = [70, 224];
const REST_R: Point = [186, 224];
const UP_L: Point = [36, 30];
const UP_R: Point = [220, 30];

function stretchRaise(name: string, u: number) {
  if (name === "reach") return sstep(u);
  if (name === "yawn") return 1;
  if (name === "relax") return 1 - sstep(u);
  return 0;
}

const stretch: ActivityDef = {
  enter: "below",
  build(gEl) {
    const mouth = el("ellipse", { cx: 128, cy: 178, rx: 0, ry: 0, fill: C.line, opacity: 0 }, gEl);
    const handL = makeHand(gEl);
    const handR = makeHand(gEl);
    return { mouth, handL, handR };
  },
  motion(clock) {
    const { name, u } = phaseOf(clock, STRETCH_SCHEDULE);
    const m: MotionOut = { tilt: 0, ty: 0, squash: 0, gaze: null, eye: "soft" };
    if (name === "reach") {
      const s = sstep(u);
      m.squash += 0.07 * s;
      m.ty += -6 * s;
      m.eye = "wide";
    } else if (name === "yawn") {
      m.squash += 0.07;
      m.ty += -6;
      m.tilt += 3 * Math.sin(2 * Math.PI * u);
      m.eye = "yawn";
    } else if (name === "relax") {
      const s = sstep(u);
      m.squash += lerp(0.07, -0.04, s);
      m.ty += lerp(-6, 0, s);
      m.eye = "sleepy";
    } else {
      m.squash += -0.04 * (1 - sstep(u));
    }
    return m;
  },
  paint(clock, parts) {
    const { name, u } = phaseOf(clock, STRETCH_SCHEDULE);
    const r = stretchRaise(name, u);
    const shake = name === "yawn" ? Math.sin(clock * 0.04) * 2 * bump(u) : 0;
    const l = lerpPt(REST_L, UP_L, r);
    const rr = lerpPt(REST_R, UP_R, r);
    setXform(parts.handL as SVGElement, l[0] - shake, l[1], -20 * r);
    setXform(parts.handR as SVGElement, rr[0] + shake, rr[1], 20 * r);
    const open = name === "yawn" ? bump(u) : 0;
    const mouth = parts.mouth as SVGEllipseElement;
    mouth.setAttribute("rx", (10 * open).toFixed(2));
    mouth.setAttribute("ry", (13 * open).toFixed(2));
    mouth.setAttribute("opacity", open > 0.001 ? "1" : "0");
  },
};

const ACTIVITY_DEFS: Record<CentaurActivity, ActivityDef> = {
  reading,
  music,
  writing,
  tea,
  stretch,
};

type PropInstance = {
  name: CentaurActivity;
  def: ActivityDef;
  g: SVGGElement;
  parts: ActivityParts;
  presence: Spring;
  clock: number;
};

export class CentaurProps {
  private group: SVGGElement;
  private insts: PropInstance[] = [];
  private active: PropInstance | null = null;
  private enabled: boolean;

  constructor(poseG: SVGGElement, enabled = true) {
    this.enabled = enabled;
    this.group = el("g", { class: "centaur-props", "aria-hidden": "true" }, poseG) as SVGGElement;
    this.group.style.pointerEvents = "none";
    if (!enabled) this.group.style.display = "none";
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.group.style.display = enabled ? "" : "none";
    if (!enabled && this.active) {
      this.active.presence.t = 0;
      this.active = null;
    }
  }

  setActivity(name: string) {
    if (!this.enabled) return;
    if (this.active && this.active.name === name) return;
    if (this.active) this.active.presence.t = 0;
    this.active = null;
    const def = ACTIVITY_DEFS[name as CentaurActivity];
    if (!def) return;
    let inst = this.insts.find((it) => it.name === name);
    if (!inst) {
      const gEl = el("g", { class: `centaur-prop-${name}` }, this.group) as SVGGElement;
      gEl.style.opacity = "0";
      inst = { name: name as CentaurActivity, def, g: gEl, parts: def.build(gEl), presence: spring(0), clock: 0 };
      this.insts.push(inst);
    }
    inst.presence.t = 1;
    this.active = inst;
  }

  update(_now: number, dt: number): MotionOut {
    const out: MotionOut = { tilt: 0, ty: 0, squash: 0, gaze: null, eye: null };
    if (!this.enabled) return out;

    const steps = springSteps(dt);
    const h = dt / steps;
    let gazeP = 0.5;
    for (const inst of this.insts.slice()) {
      const p = inst.presence;
      for (let i = 0; i < steps; i++) stepSpring(p, SPRINGS.prop[0], SPRINGS.prop[1], h);
      inst.clock += dt * 1000;
      if (p.t === 0 && Math.abs(p.x) < 0.01 && Math.abs(p.v) < 0.05) {
        inst.g.remove();
        this.insts.splice(this.insts.indexOf(inst), 1);
        continue;
      }
      const m = inst.def.motion(inst.clock);
      const w = clamp(p.x, 0, 1);
      out.tilt += (m.tilt || 0) * w;
      out.ty += (m.ty || 0) * w;
      out.squash += (m.squash || 0) * w;
      if (m.gaze && p.x > gazeP) {
        gazeP = p.x;
        out.gaze = m.gaze;
      }
      if (m.eye && p.t === 1) out.eye = m.eye;
    }
    return out;
  }

  paint() {
    if (!this.enabled) return;
    for (const inst of this.insts) {
      const p = clamp(inst.presence.x, -0.2, 1.2);
      const off = inst.def.enter === "above" ? -(1 - p) * 44 : (1 - p) * 40;
      inst.g.setAttribute("transform", `translate(0 ${off.toFixed(2)})`);
      inst.g.style.opacity = clamp(p, 0, 1).toFixed(3);
      inst.def.paint(inst.clock, inst.parts);
    }
  }
}
