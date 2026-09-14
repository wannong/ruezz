import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyGraphForces,
  asLayoutNode,
  graphCollideRadius,
  graphLabelWidth,
  graphLinkDistance,
  graphNodeRadius,
  type GraphForceApi,
} from "./graph-layout.ts";

test("graphNodeRadius grows with degree and caps", () => {
  assert.equal(graphNodeRadius({ degree: 0 }), 4);
  assert.equal(graphNodeRadius({ degree: 0 }, true), 4);
  assert.equal(graphNodeRadius({ degree: 0, focused: true }), 6);
  assert.equal(graphNodeRadius({ degree: 40 }), 12);
  assert.equal(graphNodeRadius({ degree: 40 }, true), 9);
});

test("graphLinkDistance grows with both node radii", () => {
  const small = graphLinkDistance({ degree: 0 }, { degree: 0 });
  const mixed = graphLinkDistance({ degree: 0 }, { degree: 40 });
  const large = graphLinkDistance({ degree: 40 }, { degree: 40 });
  assert.ok(mixed > small);
  assert.ok(large > mixed);
  assert.equal(
    large - small,
    graphNodeRadius({ degree: 40 }) * 2 - graphNodeRadius({ degree: 0 }) * 2,
  );
});

test("labels increase collision and link spacing without unbounded expansion", () => {
  const short = { degree: 0, label: "A" };
  const long = { degree: 0, label: "A very long page name that should be truncated in the graph" };
  assert.ok(graphLabelWidth(long.label) > graphLabelWidth(short.label));
  assert.ok(graphCollideRadius(long) > graphCollideRadius(short));
  assert.ok(graphLinkDistance(long, short) > graphLinkDistance(short, short));
  assert.ok(graphLabelWidth(long.label) <= 168);
  assert.ok(graphCollideRadius(long) < 200);
});

test("graphCollideRadius is larger than the drawn disk", () => {
  const node = { degree: 40 };
  assert.ok(graphCollideRadius(node) > graphNodeRadius(node));
  assert.ok(graphCollideRadius(node) * 2 > graphLinkDistance({ degree: 0 }, { degree: 0 }) - 20);
});

test("asLayoutNode marks the focused id", () => {
  assert.equal(asLayoutNode({ id: "hub", label: "Hub", degree: 3 }, "hub").focused, true);
  assert.equal(asLayoutNode({ id: "hub", label: "Hub" }).label, "Hub");
  assert.equal(asLayoutNode({ id: "other", degree: 3 }, "hub").focused, false);
  assert.equal(asLayoutNode("hub", "hub").degree, 0);
});

test("applyGraphForces sizes links and collide from node radii", () => {
  let linkDistance: ((link: { source?: unknown; target?: unknown }) => number) | undefined;
  const collideCalls: unknown[] = [];
  const fg: GraphForceApi = {
    d3Force(name: string, force?: unknown) {
      if (name === "link") {
        return {
          distance(value: unknown) {
            linkDistance = value as typeof linkDistance;
            return this;
          },
          strength() {
            return this;
          },
        };
      }
      if (name === "charge") {
        return {
          strength() {
            return this;
          },
          distanceMin() {
            return this;
          },
          distanceMax() {
            return this;
          },
        };
      }
      if (name === "center") {
        return {
          strength() {
            return this;
          },
        };
      }
      if (force !== undefined) {
        collideCalls.push(force);
      }
      return force;
    },
  };

  applyGraphForces(fg, false);
  assert.equal(collideCalls.length, 1);
  assert.ok(linkDistance);

  const small = linkDistance!({ source: { degree: 0 }, target: { degree: 0 } });
  const large = linkDistance!({ source: { degree: 40 }, target: { degree: 40 } });
  assert.ok(large > small);
  assert.equal(large, graphLinkDistance({ degree: 40 }, { degree: 40 }));
});
