import { forceCollide } from "d3-force-3d";

export type GraphLayoutNode = {
  id?: string;
  label?: string;
  degree?: number;
  focused?: boolean;
};

type GraphForce = {
  strength?: (value: number) => unknown;
  distance?: (value: number | ((link: { source?: unknown; target?: unknown }) => number)) => unknown;
  radius?: (value: number | ((node: unknown) => number)) => unknown;
  iterations?: (value: number) => unknown;
  distanceMin?: (value: number) => unknown;
  distanceMax?: (value: number) => unknown;
};

export type GraphForceApi = {
  d3Force: (name: string, force?: unknown) => unknown;
};

/** Visual disk radius. Degree only enlarges up to a cap so hubs stay readable. */
export function graphNodeRadius(node: GraphLayoutNode, compact = false): number {
  const degree = Math.max(0, Number(node.degree) || 0);
  const base = node.focused ? 6 : 4;
  const extra = Math.min(compact ? 5 : 8, degree * 0.35);
  return base + extra;
}

const LABEL_MAX_WIDTH = 168;
const COMPACT_LABEL_MAX_WIDTH = 104;
const LABEL_FONT_SIZE = 12;

/** The canvas uses the same bounded approximation before the font is available. */
export function graphLabelWidth(label: string | undefined, compact = false): number {
  if (!label) return 0;
  const width = Array.from(label).reduce(
    (sum, char) => sum + (char.charCodeAt(0) > 0xff ? LABEL_FONT_SIZE : LABEL_FONT_SIZE * 0.56),
    0,
  );
  return Math.min(compact ? COMPACT_LABEL_MAX_WIDTH : LABEL_MAX_WIDTH, width);
}

export function graphLabelHeight(compact = false): number {
  return compact ? 10 : LABEL_FONT_SIZE;
}

/** Collision radius includes the label's bounded horizontal footprint. */
export function graphCollideRadius(node: GraphLayoutNode, compact = false): number {
  const radius = graphNodeRadius(node, compact);
  const labelWidth = graphLabelWidth(node.label, compact);
  const labelGap = compact ? 3 : 5;
  const labelHeight = graphLabelHeight(compact);
  const labelRadius = Math.hypot((labelGap + labelWidth) / 2, labelHeight / 2);
  return Math.max(radius + (compact ? 6 : 8), labelRadius + 2);
}

export function graphLinkGap(compact = false): number {
  return compact ? 24 : 32;
}

/** Center-to-center link length from the nodes' disks and bounded labels. */
export function graphLinkDistance(
  source: GraphLayoutNode,
  target: GraphLayoutNode,
  compact = false,
): number {
  return graphCollideRadius(source, compact) + graphCollideRadius(target, compact) + graphLinkGap(compact);
}

export function asLayoutNode(value: unknown, focusId?: string | null): GraphLayoutNode {
  if (!value || typeof value !== "object") return { degree: 0 };
  const node = value as { id?: unknown; label?: unknown; degree?: unknown };
  const id = node.id == null ? undefined : String(node.id);
  return {
    id,
    label: node.label == null ? undefined : String(node.label),
    degree: Number(node.degree) || 0,
    focused: Boolean(focusId && id === focusId),
  };
}

/**
 * Default many-body charge has infinite range, so a drag (which reheats
 * the sim) pushes every other node away forever. Keep local push / link
 * follow, but cut repulsion beyond a few link-lengths.
 *
 * Link length and collide radius follow each node's drawn size, otherwise
 * high-degree disks sit on top of each other. Labels are bounded so this does
 * not make a single long page name expand the whole graph without limit.
 */
export function applyGraphForces(fg: GraphForceApi, compact = false, focusId?: string | null) {
  const layout = (value: unknown) => asLayoutNode(value, focusId);

  const charge = fg.d3Force("charge") as GraphForce | undefined;
  charge?.strength?.(compact ? -42 : -48);
  charge?.distanceMin?.(compact ? 12 : 16);
  charge?.distanceMax?.(compact ? 160 : 220);

  const link = fg.d3Force("link") as GraphForce | undefined;
  link?.distance?.((item) => graphLinkDistance(layout(item.source), layout(item.target), compact));
  link?.strength?.(1);

  const collide = forceCollide((node: unknown) => graphCollideRadius(layout(node), compact))
    .strength(0.9)
    .iterations(2);
  fg.d3Force("collide", collide);

  const center = fg.d3Force("center") as GraphForce | undefined;
  center?.strength?.(0.12);
}
