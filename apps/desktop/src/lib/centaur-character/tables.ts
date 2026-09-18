import { EYE_BY_ID, GEO } from "./geometry";

const id = (name: string) => EYE_BY_ID[name];

export const STATES = [
  "idle",
  "curious",
  "happy",
  "thinking",
  "sleepy",
  "surprised",
  "angry",
  "playful",
  "sad",
  "proud",
  "confused",
  "bored",
  "listening",
] as const;

export type CentaurState = (typeof STATES)[number];

export const EYE_PLAYLIST: Record<CentaurState, string[]> = {
  idle: ["normal", "soft", "lookLeft", "lookRight", "normal"],
  curious: ["wide", "lookLeft", "lookRight", "normal", "wide"],
  happy: ["happy", "soft", "winkL", "happy", "proud"],
  thinking: ["thinking", "lookLeft", "suspicious", "thinking", "bored"],
  sleepy: ["sleepy", "blink", "sleepy", "bored"],
  surprised: ["surprise", "wide", "scared", "surprise"],
  angry: ["angry", "suspicious", "angry"],
  playful: ["playful", "winkR", "happy", "lookLeft", "playful"],
  sad: ["sad", "sleepy", "sad", "bored"],
  proud: ["proud", "soft", "happy", "proud"],
  confused: ["confused", "lookLeft", "lookRight", "confused"],
  bored: ["bored", "sleepy", "lookRight", "bored"],
  listening: ["normal", "wide", "lookLeft", "soft", "normal"],
};

export const PUNCT_FX: Record<CentaurState, Array<string | Record<string, unknown>>> = {
  idle: [],
  curious: ["?"],
  happy: ["♪"],
  thinking: [{ kind: "spinner" }],
  sleepy: ["z", "z", "z"],
  surprised: ["!", "!"],
  angry: ["╬"],
  playful: ["♪", "?", "!"],
  sad: [
    { kind: "tear", x: -8, y: 18 },
    { kind: "tear", x: 10, y: 28 },
  ],
  proud: ["!"],
  confused: ["?", "?"],
  bored: ["…"],
  listening: ["…"],
};

export const EYE_HOLD_MS: Record<CentaurState, [number, number]> = {
  idle: [3500, 7000],
  curious: [1800, 3200],
  happy: [2200, 4000],
  thinking: [2000, 3800],
  sleepy: [4000, 8000],
  surprised: [1800, 3000],
  angry: [2200, 4000],
  playful: [1500, 2800],
  sad: [3500, 6000],
  proud: [2800, 5000],
  confused: [2000, 3600],
  bored: [3500, 6000],
  listening: [2500, 4500],
};

export const BLINK_MS: Record<CentaurState, [number, number] | null> = {
  idle: [5000, 12000],
  curious: [2800, 6000],
  happy: [2500, 5500],
  thinking: [3500, 7000],
  sleepy: null,
  surprised: [2000, 4000],
  angry: [4000, 8000],
  playful: [2000, 4500],
  sad: [4000, 8000],
  proud: [3500, 7000],
  confused: [2800, 5500],
  bored: [4000, 8000],
  listening: [3000, 6500],
};

export const POSE_TARGETS: Record<
  CentaurState,
  { tilt: number; ty: number; squash: number; gazeAmp: number }
> = {
  idle: { tilt: 0, ty: 0, squash: 1, gazeAmp: 4 },
  curious: { tilt: -6, ty: -2, squash: 1.02, gazeAmp: 8 },
  happy: { tilt: 4, ty: -4, squash: 0.96, gazeAmp: 3 },
  thinking: { tilt: 8, ty: 1, squash: 1.01, gazeAmp: 5 },
  sleepy: { tilt: -3, ty: 4, squash: 1.04, gazeAmp: 1 },
  surprised: { tilt: 0, ty: -8, squash: 0.92, gazeAmp: 2 },
  angry: { tilt: -2, ty: 0, squash: 1.03, gazeAmp: 2 },
  playful: { tilt: -10, ty: -3, squash: 0.97, gazeAmp: 7 },
  sad: { tilt: 5, ty: 3, squash: 1.05, gazeAmp: 2 },
  proud: { tilt: -4, ty: -5, squash: 0.98, gazeAmp: 2 },
  confused: { tilt: 12, ty: 0, squash: 1.0, gazeAmp: 6 },
  bored: { tilt: 6, ty: 2, squash: 1.02, gazeAmp: 2 },
  listening: { tilt: -5, ty: -1, squash: 1.0, gazeAmp: 5 },
};

export const SPRINGS = {
  tilt: [6, 0.85],
  ty: [5, 0.9],
  squash: [10, 0.8],
  blink: [26, 1],
  gazeX: [12, 1],
  gazeY: [12, 1],
  morph: [8, 0.9],
  spin: [5, 0.9],
} as const;

export const WINK_STATES = new Set<CentaurState>(["idle", "happy", "playful", "curious", "proud"]);

export const CYCLE_ORDER: CentaurState[] = [
  "happy",
  "curious",
  "playful",
  "thinking",
  "listening",
  "proud",
  "idle",
  "surprised",
  "confused",
  "sleepy",
  "sad",
  "bored",
  "angry",
];

export const TABLES = {
  STATES,
  EYE_PLAYLIST,
  EYE_HOLD_MS,
  BLINK_MS,
  POSE_TARGETS,
  SPRINGS,
  WINK_STATES,
  CYCLE_ORDER,
  PUNCT_FX,
  id,
  GEO,
};
