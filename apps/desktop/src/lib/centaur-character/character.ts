import {
  spring,
  stepSpring,
  springSteps,
  clamp,
  rand,
  easeInOutCubic,
  lerpPoly,
  type Spring,
  type Point,
} from "./math";
import {
  BLINK_MS,
  CYCLE_ORDER,
  EYE_HOLD_MS,
  EYE_PLAYLIST,
  POSE_TARGETS,
  SPRINGS,
  WINK_STATES,
  type CentaurState,
} from "./tables";
import * as EY from "./eyes";
import { EXPRESSIONS, EYE_BY_ID, GEO } from "./geometry";
import { EmotionPunctuation } from "./fx";

const NS = "http://www.w3.org/2000/svg";
let instanceSeq = 0;

export type CentaurCharacterOptions = {
  state?: CentaurState;
  followPointer?: boolean;
  paused?: boolean;
  autoCycle?: boolean;
  onChange?: (info: { state: CentaurState; eye: string }) => void;
  sizePx?: number;
  punctuationFx?: boolean;
  emotionFx?: boolean;
};

export class CentaurCharacter {
  private svg: SVGSVGElement;
  state: CentaurState;
  followPointer: boolean;
  paused: boolean;
  autoCycle: boolean;
  onChange: (info: { state: CentaurState; eye: string }) => void;
  sizePx: number;
  punctuationFx: boolean;

  tilt: Spring;
  ty: Spring;
  squash: Spring;
  blink: Spring;
  gazeX: Spring;
  gazeY: Spring;
  morph: Spring;

  eyeFrom = 0;
  eyeTo = 0;
  eyeIdx = 0;
  private _fromPolys: [Point[], Point[]] | null = null;

  t0: number;
  stateAt: number;
  last: number;
  cycleIdx: number;
  eyeUntil: number;
  blinkUntil: number;
  gazeUntil: number;
  cycleUntil: number;
  blinkQueue: Array<{ at: number; v: number }>;
  winkAt: number;
  winkEye: number;
  winkUntil: number;
  hopAt: number;
  pointer: { x: number; y: number };
  pointerRaw: { x: number; y: number } | null;

  private clipIds: string[];
  clipEls: SVGPathElement[];
  poseG!: SVGGElement;
  eyesG!: SVGGElement;
  eyeEls!: SVGPathElement[];
  hlEls!: SVGRectElement[];
  fx!: EmotionPunctuation;
  private _raf = 0;
  private _onMove!: (e: PointerEvent) => void;
  private _onLeave!: () => void;

  constructor(svg: SVGSVGElement, opts: CentaurCharacterOptions = {}) {
    this.svg = svg;
    this.state = opts.state ?? "happy";
    this.followPointer = opts.followPointer !== false;
    this.paused = !!opts.paused;
    this.autoCycle = opts.autoCycle !== false;
    this.onChange = opts.onChange ?? (() => {});
    this.sizePx = opts.sizePx ?? 160;
    this.punctuationFx = opts.punctuationFx !== false && opts.emotionFx !== false;

    this.tilt = spring(0);
    this.ty = spring(0);
    this.squash = spring(1);
    this.blink = spring(1);
    this.gazeX = spring(0);
    this.gazeY = spring(0);
    this.morph = spring(1);

    const now = performance.now();
    this.t0 = now;
    this.stateAt = now;
    this.last = now;
    this.cycleIdx = CYCLE_ORDER.indexOf(this.state);
    if (this.cycleIdx < 0) this.cycleIdx = 0;
    this.eyeUntil = now + rand(...(EYE_HOLD_MS[this.state] ?? [3000, 6000]));
    this.blinkUntil = now + rand(2000, 6000);
    this.gazeUntil = now + 800;
    this.cycleUntil = now + rand(8000, 14000);
    this.blinkQueue = [];
    this.winkAt = -1e9;
    this.winkEye = 0;
    this.winkUntil = now + rand(4000, 9000);
    this.hopAt = -1;
    this.pointer = { x: 0, y: 0 };
    this.pointerRaw = null;

    this.clipIds = [];
    this.clipEls = [];
    this._build();
    this.setState(this.state, { resetEyes: true });
    this._bindPointer();
    this._paint(now);
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._unbindPointer();
  }

  setPaused(v: boolean) {
    this.paused = !!v;
  }

  setFollowPointer(v: boolean) {
    this.followPointer = !!v;
    if (!v) this.pointerRaw = null;
  }

  setAutoCycle(v: boolean) {
    this.autoCycle = !!v;
  }

  setPunctuationFx(v: boolean) {
    this.punctuationFx = !!v;
    if (this.fx) {
      this.fx.setEnabled(this.punctuationFx);
      if (this.punctuationFx) this.fx.setState(this.state);
    }
  }

  setEmotionFx(v: boolean) {
    this.setPunctuationFx(v);
  }

  setState(name: CentaurState, opts: { resetEyes?: boolean } = {}) {
    if (!POSE_TARGETS[name]) name = "happy";
    this.state = name;
    this.stateAt = performance.now();
    if (this.fx) this.fx.setState(name, this.stateAt);
    const pose = POSE_TARGETS[name];
    this.tilt.t = pose.tilt;
    this.ty.t = pose.ty;
    this.squash.t = pose.squash;

    const list = EYE_PLAYLIST[name] ?? EYE_PLAYLIST.happy;
    if (opts.resetEyes) {
      this.eyeIdx = 0;
      const toId = EYE_BY_ID[list[0]] ?? 0;
      this.eyeFrom = toId;
      this.eyeTo = toId;
      this.morph.x = 1;
      this.morph.v = 0;
      this.morph.t = 1;
      this._fromPolys = null;
    } else {
      this._advanceEye(true);
    }
    this.eyeUntil = this.stateAt + rand(...(EYE_HOLD_MS[name] ?? [2500, 4500]));
    const bms = BLINK_MS[name];
    this.blinkUntil = bms ? this.stateAt + rand(...bms) : 1e15;
    this.onChange({ state: this.state, eye: this._eyeName() });
  }

  private _eyeName() {
    return EXPRESSIONS[this.eyeTo]?.id ?? "normal";
  }

  private _advanceEye(immediate: boolean) {
    const list = EYE_PLAYLIST[this.state] ?? EYE_PLAYLIST.happy;
    this.eyeIdx = (this.eyeIdx + 1) % list.length;
    const nextId = EYE_BY_ID[list[this.eyeIdx]] ?? 0;
    const cur = this._currentPolys();
    this._fromPolys = cur;
    this.eyeFrom = this.eyeTo;
    this.eyeTo = nextId;
    this.morph.x = immediate ? 1 : 0;
    this.morph.v = 0;
    this.morph.t = 1;
    this.onChange({ state: this.state, eye: this._eyeName() });
  }

  private _currentPolys(): [Point[], Point[]] {
    const t = easeInOutCubic(clamp(this.morph.x, 0, 1));
    const from = this._fromPolys ?? EXPRESSIONS[this.eyeFrom].pair;
    const to = EXPRESSIONS[this.eyeTo].pair;
    return [lerpPoly(from[0], to[0], t), lerpPoly(from[1], to[1], t)];
  }

  private _build() {
    const svg = this.svg;
    svg.setAttribute("viewBox", "0 0 256 256");
    svg.setAttribute("width", String(this.sizePx));
    svg.setAttribute("height", String(this.sizePx));
    svg.innerHTML = "";

    const defs = document.createElementNS(NS, "defs");
    this.clipIds = [0, 1].map((i) => `centaur-eye-clip-${instanceSeq++}-${i}`);
    this.clipEls = this.clipIds.map((id) => {
      const clip = document.createElementNS(NS, "clipPath");
      clip.setAttribute("id", id);
      clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      const path = document.createElementNS(NS, "path");
      clip.appendChild(path);
      defs.appendChild(clip);
      return path;
    });
    svg.appendChild(defs);

    const plate = document.createElementNS(NS, "rect");
    plate.setAttribute("width", "256");
    plate.setAttribute("height", "256");
    plate.setAttribute("rx", String(GEO.PLATE.rx));
    plate.setAttribute("fill", GEO.COLORS.plate);
    svg.appendChild(plate);

    this.poseG = document.createElementNS(NS, "g");
    this.poseG.setAttribute("class", "centaur-pose");
    svg.appendChild(this.poseG);

    const head = document.createElementNS(NS, "path");
    head.setAttribute("d", GEO.HEAD.path);
    head.setAttribute("fill", GEO.COLORS.head);
    this.poseG.appendChild(head);

    this.eyesG = document.createElementNS(NS, "g");
    this.eyesG.setAttribute("class", "centaur-eyes");
    this.poseG.appendChild(this.eyesG);

    this.eyeEls = [0, 1].map(() => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("fill", GEO.COLORS.eye);
      this.eyesG.appendChild(p);
      return p;
    });

    this.hlEls = [0, 1].map((i) => {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("rx", "6");
      r.setAttribute("ry", "6");
      r.setAttribute("fill", GEO.HIGHLIGHT.fill);
      r.setAttribute("clip-path", `url(#${this.clipIds[i]})`);
      r.style.opacity = "1";
      this.eyesG.appendChild(r);
      return r;
    });

    this.fx = new EmotionPunctuation(svg, { enabled: this.punctuationFx });
  }

  private _bindPointer() {
    this._onMove = (e) => {
      if (!this.followPointer) return;
      this.pointerRaw = { x: e.clientX, y: e.clientY };
    };
    this._onLeave = () => {
      this.pointerRaw = null;
    };
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerleave", this._onLeave);
  }

  private _unbindPointer() {
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerleave", this._onLeave);
  }

  private _updatePointerGaze() {
    if (!this.followPointer || !this.pointerRaw) {
      return false;
    }
    const rect = this.svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (this.pointerRaw.x - cx) / (rect.width * 0.5);
    const dy = (this.pointerRaw.y - cy) / (rect.height * 0.5);
    this.gazeX.t = clamp(dx, -1, 1) * 10;
    this.gazeY.t = clamp(dy, -1, 1) * 7;
    return true;
  }

  private _tick(now: number) {
    this._raf = requestAnimationFrame((t) => this._tick(t));
    if (this.paused) {
      this.last = now;
      return;
    }
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;

    if (this.autoCycle && now >= this.cycleUntil) {
      this.cycleIdx = (this.cycleIdx + 1) % CYCLE_ORDER.length;
      this.setState(CYCLE_ORDER[this.cycleIdx]);
      this.cycleUntil = now + rand(7000, 13000);
    }

    if (now >= this.eyeUntil) {
      this._advanceEye(false);
      this.eyeUntil = now + rand(...(EYE_HOLD_MS[this.state] ?? [2500, 4500]));
    }

    const bms = BLINK_MS[this.state];
    if (bms && now >= this.blinkUntil) {
      EY.queueBlink(this.blinkQueue, now);
      this.blinkUntil = now + rand(...bms);
    }
    const blinkKey = EY.consumeBlink(this.blinkQueue, now);
    if (blinkKey != null) this.blink.t = blinkKey;

    if (WINK_STATES.has(this.state) && now >= this.winkUntil) {
      this.winkAt = now;
      this.winkEye = Math.random() < 0.5 ? 0 : 1;
      this.winkUntil = now + rand(6000, 14000);
    }

    if (!this._updatePointerGaze()) {
      if (now >= this.gazeUntil) {
        const amp = POSE_TARGETS[this.state]?.gazeAmp ?? 4;
        this.gazeX.t = rand(-amp, amp);
        this.gazeY.t = rand(-amp * 0.6, amp * 0.6);
        this.gazeUntil = now + rand(900, 2800);
      }
    }

    if (["happy", "playful", "surprised", "proud"].includes(this.state)) {
      if (this.hopAt < 0) this.hopAt = now + rand(1800, 4000);
      if (now >= this.hopAt) {
        this.ty.v -= rand(80, 140);
        this.squash.v -= rand(2, 4);
        this.hopAt = now + rand(2200, 5000);
      }
    } else {
      this.hopAt = -1;
    }

    if (this.state === "idle") {
      this.tilt.t = Math.sin(now * 0.0007) * 2.5;
    }

    const steps = springSteps(dt);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      stepSpring(this.tilt, SPRINGS.tilt[0], SPRINGS.tilt[1], h);
      stepSpring(this.ty, SPRINGS.ty[0], SPRINGS.ty[1], h);
      stepSpring(this.squash, SPRINGS.squash[0], SPRINGS.squash[1], h);
      stepSpring(this.blink, SPRINGS.blink[0], SPRINGS.blink[1], h);
      stepSpring(this.gazeX, SPRINGS.gazeX[0], SPRINGS.gazeX[1], h);
      stepSpring(this.gazeY, SPRINGS.gazeY[0], SPRINGS.gazeY[1], h);
      stepSpring(this.morph, SPRINGS.morph[0], SPRINGS.morph[1], h);
    }

    this.fx.update(now, dt);
    this._paint(now);
  }

  private _paint(now: number) {
    const cx = 128;
    const cy = 128;
    const sq = this.squash.x;
    const sx = 1 + (1 - sq) * 0.35;
    const sy = sq;
    const rot = this.tilt.x;
    const ty = this.ty.x;

    this.poseG.setAttribute(
      "transform",
      `translate(${cx} ${cy + ty}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-cx} ${-cy})`,
    );

    const polys = this._currentPolys();
    const pulse = 1 + 0.04 * Math.sin(easeInOutCubic(clamp(this.morph.x, 0, 1)) * Math.PI);

    EY.paintEyes({
      now,
      polys,
      blinkX: this.blink.x,
      winkAt: this.winkAt,
      winkEye: this.winkEye,
      gazeX: this.gazeX.x,
      gazeY: this.gazeY.x,
      eyeEls: this.eyeEls,
      hlEls: this.hlEls,
      clipEls: this.clipEls,
      pulse,
    });
    this.fx.paint(now);
  }
}
