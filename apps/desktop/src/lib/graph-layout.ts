import { forceCollide } from "d3-force-3d";

export type GraphLayoutNode = {
  id?: string;
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

/** Collision radius: visual disk plus a gap so large nodes do not sit on top of each other. */
export function graphCollideRadius(node: GraphLayoutNode, compact = false): number {
  return graphNodeRadius(node, compact) + (compact ? 6 : 8);
}

export function graphLinkGap(compact = false): number {
  return compact ? 18 : 26;
}

/** Center-to-center link length from the two nodes' actual radii. */
export function graphLinkDistance(
  source: GraphLayoutNode,
  target: GraphLayoutNode,
  compact = false,
): number {
  return graphNodeRadius(source, compact) + graphNodeRadius(target, compact) + graphLinkGap(compact);
}

export function asLayoutNode(value: unknown, focusId?: string | null): GraphLayoutNode {
  if (!value || typeof value !== "object") return { degree: 0 };
  const node = value as { id?: unknown; degree?: unknown };
  const id = node.id == null ? undefined : String(node.id);
  return {
    id,
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
 * high-degree disks sit on top of each other.
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
