import { graphlib, layout } from '@dagrejs/dagre';
import { Position } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 230;
const NODE_HEIGHT = 130;

type AnyNode = Node<Record<string, unknown>>;

export function layoutGraph(
  nodes: AnyNode[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR'
): { nodes: AnyNode[]; edges: Edge[] } {
  const g = new graphlib.Graph();
  g.setDefaultNodeLabel(() => ({}));
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, align: 'UL', nodesep: 48, ranksep: 96, marginx: 24, marginy: 24 });

  nodes.forEach((n) => {
    g.setNode(n.id, { width: NODE_WIDTH, height: getNodeHeight(n) });
  });
  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  layout(g);

  const targetPosition: Position = direction === 'LR' ? Position.Left : Position.Top;
  const sourcePosition: Position = direction === 'LR' ? Position.Right : Position.Bottom;

  const laidOut = nodes.map((n): AnyNode => {
    const lbl = g.node(n.id) as { x: number; y: number };
    const h = getNodeHeight(n);
    return {
      ...n,
      targetPosition,
      sourcePosition,
      position: { x: lbl.x - NODE_WIDTH / 2, y: lbl.y - h / 2 },
    };
  });

  // Move byproduct nodes outward so they appear on the outside of the layout.
  // Compute layout center using node centers, then push any node flagged with `data.tree.isByproduct` outward.
  const center = laidOut.reduce(
    (acc, n) => {
      const h = getNodeHeight(n);
      const cx = (n.position?.x ?? 0) + NODE_WIDTH / 2;
      const cy = (n.position?.y ?? 0) + h / 2;
      acc.x += cx;
      acc.y += cy;
      return acc;
    },
    { x: 0, y: 0 }
  );
  center.x /= laidOut.length || 1;
  center.y /= laidOut.length || 1;

  // Compute maximum existing radius so byproducts are placed outside everything.
  const centers = laidOut.map((n) => {
    const h = getNodeHeight(n);
    return {
      id: n.id,
      cx: (n.position?.x ?? 0) + NODE_WIDTH / 2,
      cy: (n.position?.y ?? 0) + h / 2,
    };
  });
  let maxDist = 0;
  for (const c of centers) {
    const dx = c.cx - center.x;
    const dy = c.cy - center.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxDist) maxDist = d;
  }
  // base radius to place byproducts on — keep a small padding beyond existing nodes
  // (computed but not currently used)

  // Keep byproduct nodes positioned like normal nodes produced by dagre.
  return { nodes: laidOut, edges };
}

function getNodeHeight(node: AnyNode): number {
  // taller nodes for items with several ingredients
  const count = (node.data?.ingredients as Array<unknown> | undefined)?.length ?? 0;
  return Math.max(NODE_HEIGHT, 100 + count * 18);
}

export { NODE_WIDTH, NODE_HEIGHT };
