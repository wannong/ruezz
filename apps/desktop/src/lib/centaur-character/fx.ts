import { clamp, rand, spring, stepSpring, springSteps, type Spring } from "./math";
import { LEFT } from "./geometry";
import { PUNCT_FX, type CentaurState } from "./tables";

const NS = "http://www.w3.org/2000/svg";
const EYE_SIZE = LEFT.h;

const ANCHORS = [
  { x: 220, y: 69, r: -10 },
  { x: 34, y: 68, r: 10 },
  { x: 232, y: 44, r: 12 },
  { x: 24, y: 48, r: -12 },
];

const TEAR_ANCHORS = [
  { x: 96, y: 158, r: 8 },
  { x: 160, y: 162, r: -6 },
];

type PunctEntry = string | { kind?: string; text?: string; x?: number; y?: number; rotate?: number };

function tearPath(s: number) {
  const h = s;
  const w = s * 0.42;
  return [
    `M0 ${-h * 0.48}`,
    `C${w * 0.55} ${-h * 0.1} ${w * 0.55} ${h * 0.28} 0 ${h * 0.48}`,
    `C${-w * 0.55} ${h * 0.28} ${-w * 0.55} ${-h * 0.1} 0 ${-h * 0.48}`,
    "Z",
  ].join("");
}

function makeSpinner(size: number) {
  const gEl = document.createElementNS(NS, "g");
  const r = size * 0.36;
  const track = document.createElementNS(NS, "circle");
  track.setAttribute("cx", "0");
  track.setAttribute("cy", "0");
  track.setAttribute("r", String(r));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "#1C1917");
  track.setAttribute("stroke-opacity", "0.18");
  track.setAttribute("stroke-width", String(Math.max(4, size * 0.1)));
  const arc = document.createElementNS(NS, "circle");
  arc.setAttribute("cx", "0");
  arc.setAttribute("cy", "0");
  arc.setAttribute("r", String(r));
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "#1C1917");
  arc.setAttribute("stroke-width", String(Math.max(4, size * 0.1)));
  arc.setAttribute("stroke-linecap", "round");
  const c = 2 * Math.PI * r;
  arc.setAttribute("stroke-dasharray", `${(c * 0.28).toFixed(1)} ${c.toFixed(1)}`);
  gEl.appendChild(track);
  gEl.appendChild(arc);
  return gEl;
}

function makeTear(size: number) {
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", tearPath(size));
  p.setAttribute("fill", "#5B8DEF");
  p.setAttribute("fill-opacity", "0.92");
  return p;
}

function makeText(text: string, size: number) {
  const el = document.createElementNS(NS, "text");
  el.textContent = text;
  el.setAttribute("x", "0");
  el.setAttribute("y", "0");
  el.setAttribute("text-anchor", "middle");
  el.setAttribute("dominant-baseline", "middle");
  el.setAttribute(
    "font-family",
    '"SF Pro Text", "PingFang SC", "Segoe UI Symbol", system-ui, sans-serif',
  );
  const fs = text === "z" ? size * 0.72 : size;
  el.setAttribute("font-size", String(fs));
  el.setAttribute("font-weight", "700");
  el.setAttribute("fill", "#1C1917");
  return el;
}

type GlyphItem = {
  el: SVGElement;
  kind: string;
  baseX: number;
  baseY: number;
  rotate: number;
  phase: number;
  spin0: number;
  scale: Spring;
  opacity: Spring;
  fadeAt: number;
  repopAt: number;
  faded: boolean;
};

export class EmotionPunctuation {
  enabled: boolean;
  private group: SVGGElement;
  private glyphs: GlyphItem[] = [];
  state: CentaurState = "idle";

  constructor(svg: SVGSVGElement, opts: { enabled?: boolean } = {}) {
    this.enabled = opts.enabled !== false;
    this.group = document.createElementNS(NS, "g");
    this.group.setAttribute("class", "centaur-emotion-punctuation");
    this.group.setAttribute("aria-hidden", "true");
    this.group.style.pointerEvents = "none";
    this.group.style.userSelect = "none";
    svg.appendChild(this.group);
    this.setEnabled(this.enabled);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.group.style.display = this.enabled ? "" : "none";
  }

  setState(name: CentaurState, now = performance.now()) {
    this.state = name;
    this.glyphs.forEach((item) => item.el.remove());
    this.glyphs = [];
    const chars = PUNCT_FX[name] || PUNCT_FX.idle || [];
    let tearI = 0;
    chars.forEach((entry, i) => {
      const punct = entry as PunctEntry;
      const kind = typeof punct === "string" ? "text" : punct.kind || "text";
      const text = typeof punct === "string" ? punct : punct.text || "";
      let el: SVGElement;
      let anchor: { x: number; y: number; r: number };
      if (kind === "spinner") {
        el = makeSpinner(EYE_SIZE);
        anchor = ANCHORS[0];
      } else if (kind === "tear") {
        el = makeTear(EYE_SIZE * 0.55);
        anchor = TEAR_ANCHORS[tearI % TEAR_ANCHORS.length];
        tearI += 1;
      } else {
        el = makeText(text, EYE_SIZE);
        anchor = ANCHORS[i % ANCHORS.length];
      }
      this.group.appendChild(el);

      const scale = spring(0.22);
      const opacity = spring(0);
      scale.t = 1;
      opacity.t = 0.92;
      this.glyphs.push({
        el,
        kind,
        baseX: anchor.x + (typeof punct === "string" ? 0 : punct.x || 0),
        baseY: anchor.y + (typeof punct === "string" ? 0 : punct.y || 0),
        rotate: anchor.r + (typeof punct === "string" ? 0 : punct.rotate || 0),
        phase: rand(0, Math.PI * 2),
        spin0: now,
        scale,
        opacity,
        fadeAt: now + rand(1700, 3000),
        repopAt: now + rand(5200, 8500),
        faded: false,
      });
    });
  }

  private repop(item: GlyphItem, now: number) {
    item.scale.x = 0.24;
    item.scale.v = 0;
    item.scale.t = 1;
    item.opacity.x = 0.2;
    item.opacity.v = 0;
    item.opacity.t = 0.9;
    item.fadeAt = now + rand(1500, 2600);
    item.repopAt = now + rand(5200, 8500);
    item.faded = false;
    item.spin0 = now;
  }

  update(now: number, dt: number) {
    if (!this.enabled || !this.glyphs.length) return;
    const steps = springSteps(dt);
    const h = dt / steps;
    for (const item of this.glyphs) {
      if (item.kind !== "spinner") {
        if (now >= item.repopAt) this.repop(item, now);
        if (!item.faded && now >= item.fadeAt) {
          item.opacity.t = 0.7;
          item.faded = true;
        }
      } else {
        item.opacity.t = 0.95;
        item.scale.t = 1;
      }
      for (let i = 0; i < steps; i++) {
        stepSpring(item.scale, 12, 0.78, h);
        stepSpring(item.opacity, 15, 0.86, h);
      }
    }
  }

  paint(now: number) {
    if (!this.enabled) return;
    for (const item of this.glyphs) {
      let driftX = Math.sin(now * 0.00105 + item.phase) * 1.8;
      let driftY =
        Math.sin(now * 0.00128 + item.phase * 1.17) * 2.4 +
        (item.kind === "tear" ? (now * 0.018 + item.phase * 8) % 14 : 0);
      const scale = clamp(item.scale.x, 0, 1.25);
      let rot = item.rotate;
      if (item.kind === "spinner") {
        rot = ((now - item.spin0) * 0.36) % 360;
      }
      item.el.setAttribute(
        "transform",
        `translate(${(item.baseX + driftX).toFixed(2)} ${(item.baseY + driftY).toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${scale.toFixed(4)})`,
      );
      item.el.style.opacity = String(clamp(item.opacity.x, 0, 1));
    }
  }
}
