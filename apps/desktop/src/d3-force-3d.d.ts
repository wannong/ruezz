declare module "d3-force-3d" {
  export type CollideForce<Node = unknown> = {
    (alpha: number): void;
    radius(radius: number | ((node: Node, i: number, nodes: Node[]) => number)): CollideForce<Node>;
    strength(strength: number): CollideForce<Node>;
    iterations(n: number): CollideForce<Node>;
    initialize(nodes: Node[], ...args: unknown[]): void;
  };

  export function forceCollide<Node = unknown>(
    radius?: number | ((node: Node, i: number, nodes: Node[]) => number),
  ): CollideForce<Node>;
}
