import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  Panel,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode, { type GraphTreeNode } from './CustomNode';
import { layoutGraph } from '../utils/layoutGraph';
import { formatRate } from '../utils/formatters';
import { useTree } from '../stores/plannerStore';
import { getItem } from '../data';
import { byproductRates } from '../utils/rates';
import type { TreeResult, TreeNode } from '../utils/calculateTree';

type GraphNode = Node<{ tree: GraphTreeNode }, 'itemNode'>;

function buildFromTree(tree: TreeResult, treeMode = false): { nodes: GraphNode[]; edges: Edge[] } {
  const EPS = 1e-6;
  if (!treeMode) {
    // only include meaningful nodes (non-zero rate) or the explicit target
    const nodes: GraphNode[] = tree.nodes
      .filter((n) => Math.abs(n.rate) > EPS || n.isTarget)
      .map((node: TreeNode) => ({
        id: node.itemId,
        type: 'itemNode',
        data: { tree: node as GraphTreeNode },
        position: { x: 0, y: 0 },
      }));

    // drop zero / near-zero flows
    const edges: Edge[] = tree.flows
      .filter((flow) => Math.abs(flow.rate) > EPS)
      .map((flow) => {
        const fromItem = getItem(flow.from);
        const isFluid = fromItem?.isFluid ?? false;

        return {
          id: `${flow.from}->${flow.to}`,
          source: flow.from,
          target: flow.to,
          label: formatRate(flow.rate, fromItem, true),
          animated: isFluid,
          style: { stroke: isFluid ? '#38bdf8' : '#4a505b' },
          labelStyle: { fill: '#9aa0a8', fontSize: 11 },
          data: { rate: flow.rate },
        };
      });

    let byprodUid = 0;

    // Create a separate isolated node for each byproduct occurrence. Do not connect byproducts to any node.
    for (const node of tree.nodes) {
      if (!node.recipe) continue;

      for (const byproduct of byproductRates(node.recipe, node.clock)) {
        const rate = node.machines * byproduct.rate;
        if (Math.abs(rate) <= EPS) continue;

        const item = getItem(byproduct.id);
        if (!item) continue;

        const id = `${byproduct.id}#byprod:${node.itemId}:${byprodUid++}`;
        nodes.push({
          id,
          type: 'itemNode',
          data: {
            tree: {
              itemId: byproduct.id,
              item,
              rate,
              recipeId: null,
              recipe: null,
              machines: 0,
              building: 'Byproduct',
              power: 0,
              isRaw: false,
              isTarget: false,
              isByproduct: true,
              clock: 1,
              ingredients: [],
            },
          },
          position: { x: 0, y: 0 },
        });

        // attach byproduct node to its producer so it appears connected
        edges.push({
          id: `${node.itemId}->byprod:${byproduct.id}:${byprodUid}`,
          source: node.itemId,
          target: id,
          label: formatRate(rate, item, true),
          animated: false,
          style: { stroke: '#a78bfa' },
          labelStyle: { fill: '#a78bfa', fontSize: 11 },
          data: { rate },
        });
      }
    }

    const edgeMap = new Map<string, Edge>();
    for (const edge of edges) {
      const a = edge.source as string;
      const b = edge.target as string;
      const key = a < b ? `${a}<->${b}` : `${b}<->${a}`;
      const existing = edgeMap.get(key);
      if (!existing) {
        edgeMap.set(key, edge);
        continue;
      }

      const existingRate = (existing.data as { rate?: number } | undefined)?.rate ?? 0;
      const edgeRate = (edge.data as { rate?: number } | undefined)?.rate ?? 0;
      if (edgeRate > existingRate) {
        edgeMap.set(key, edge);
      }
    }

    return { nodes, edges: [...edgeMap.values()] };
  }

  // treeMode: expand the aggregated tree into a true tree where each use of an item is a separate node
  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  let uid = 0;
  let byprodUid = 0;

  const nodeForItem = (tnode: TreeNode, isTargetInstance = false, requiredRate?: number) => {
    const id = `${tnode.itemId}#${uid++}`;
    const EPS = 1e-9;
    let proportion = 1;
    if (requiredRate !== undefined) {
      if (Math.abs(tnode.rate) > EPS) proportion = requiredRate / tnode.rate;
      else proportion = 0;
    }

    const scaled: GraphTreeNode = {
      ...tnode,
      rate: requiredRate !== undefined ? requiredRate : tnode.rate,
      machines: tnode.machines * proportion,
      power: tnode.power * proportion,
      isTarget: Boolean(isTargetInstance),
      ingredients: tnode.ingredients.map((ing) => ({ itemId: ing.itemId, rate: ing.rate * proportion })),
    } as GraphTreeNode;

    nodes.push({ id, type: 'itemNode', data: { tree: scaled }, position: { x: 0, y: 0 } });
    return id;
  };

  const nodeMapByItem = new Map<string, TreeNode>();
  for (const n of tree.nodes) nodeMapByItem.set(n.itemId, n);

  const visit = (
    itemId: string,
    path = new Set<string>(),
    isTargetInstance = false,
    requiredRate?: number
  ): string => {
    if (path.has(itemId)) {
      const fallback = nodeMapByItem.get(itemId);
      return fallback ? nodeForItem({ ...fallback, isTarget: false }) : `${itemId}#${uid++}`;
    }
    const tnode = nodeMapByItem.get(itemId);
    if (!tnode) {
      const id = `${itemId}#${uid++}`;
      nodes.push({ id, type: 'itemNode', data: { tree: { itemId, item: getItem(itemId)!, rate: 0, recipeId: null, recipe: null, machines: 0, building: 'Resource', power: 0, isRaw: true, isTarget: false, isByproduct: false, clock: 1, ingredients: [] } as GraphTreeNode }, position: { x: 0, y: 0 } });
      return id;
    }

    // Determine node's own rate: if requiredRate provided, scale; otherwise use full tnode.rate
    const curId = nodeForItem(tnode, isTargetInstance, requiredRate);
    path.add(itemId);
    // For each ingredient, compute the amount required by this instance and recurse with that rate
    for (const ing of tnode.ingredients) {
      const parentRate = requiredRate !== undefined ? requiredRate : tnode.rate;
      const proportion = tnode.rate > 1e-9 ? parentRate / tnode.rate : 0;
      const childRequiredRate = ing.rate * proportion;
      const childId = visit(ing.itemId, new Set(path), false, childRequiredRate);
      const fromItem = getItem(ing.itemId);
      const isFluid = fromItem?.isFluid ?? false;
      edges.push({
        id: `${childId}->${curId}`,
        source: childId,
        target: curId,
        label: formatRate(childRequiredRate, fromItem, true),
        animated: isFluid,
        style: { stroke: isFluid ? '#38bdf8' : '#4a505b' },
        labelStyle: { fill: '#9aa0a8', fontSize: 11 },
        data: { rate: childRequiredRate },
      });
    }

    // create per-instance byproducts attached to this node
    if (tnode.recipe) {
      for (const bp of byproductRates(tnode.recipe, tnode.clock)) {
        const parentRate = requiredRate !== undefined ? requiredRate : tnode.rate;
        const proportion = tnode.rate > 1e-9 ? parentRate / tnode.rate : 0;
        const byprodRate = tnode.machines * proportion * bp.rate;
        if (Math.abs(byprodRate) <= EPS) continue;

        const bpItem = getItem(bp.id);
        if (!bpItem) continue;

        const bpId = `${bp.id}#byprod:${curId}:${byprodUid++}`;
        nodes.push({
          id: bpId,
          type: 'itemNode',
          data: {
            tree: {
              itemId: bp.id,
              item: bpItem,
              rate: byprodRate,
              recipeId: null,
              recipe: null,
              machines: 0,
              building: 'Byproduct',
              power: 0,
              isRaw: false,
              isTarget: false,
              isByproduct: true,
              clock: 1,
              ingredients: [],
            },
          },
          position: { x: 0, y: 0 },
        });

        edges.push({
          id: `${curId}->byprod:${bp.id}:${byprodUid}`,
          source: curId,
          target: bpId,
          label: formatRate(byprodRate, bpItem, true),
          animated: false,
          style: { stroke: '#a78bfa' },
          labelStyle: { fill: '#a78bfa', fontSize: 11 },
          data: { rate: byprodRate },
        });
      }
    }
    return curId;
  };

  const root = tree.nodes.find((n) => n.isTarget) ?? tree.nodes[0];
  if (root) visit(root.itemId, new Set(), true);

  return { nodes, edges };
}

function miniNodeColor(node: Node) {
  const tree = node.data?.tree as GraphTreeNode | undefined;
  if (tree?.isTarget) return 'var(--color-product)';
  const item = getItem(tree?.itemId ?? (node.id as string));
  if (!item) return 'var(--color-accent)';

  // Priority: target > raw/source > byproduct > intermediate/other
  if (tree?.isRaw) {
    return item.isFluid ? 'var(--color-fluid)' : 'var(--color-raw)';
  }
  if (tree?.isByproduct) return 'var(--color-alt)';

  // Fluids that are produced/intermediate should be shown as intermediate (grey)
  if (item.isFluid) return 'var(--color-text-secondary)';

  return 'var(--color-text-secondary)';
}

const nodeTypes: NodeTypes = {
  itemNode: CustomNode,
};

export default function ProductionGraph() {
  const tree = useTree();
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [layoutKey, setLayoutKey] = useState(0);
  const [treeMode, setTreeMode] = useState(false);
  const instanceRef = useRef<ReactFlowInstance | null>(null);

  const onNodesChange = useCallback<OnNodesChange>(
    (changes) => setRfNodes((nodes) => applyNodeChanges(changes, nodes)),
    []
  );
  const onEdgesChange = useCallback<OnEdgesChange>(
    (changes) => setRfEdges((edges) => applyEdgeChanges(changes, edges)),
    []
  );

  useEffect(() => {
    if (!tree || tree.nodes.length === 0) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }
    const { nodes, edges } = buildFromTree(tree, treeMode);
    const laidOut = layoutGraph(nodes, edges, 'LR');
    setRfNodes(laidOut.nodes);
    setRfEdges(laidOut.edges);
    setLayoutKey((key) => key + 1);
  }, [tree, treeMode]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => instanceRef.current?.fitView({ padding: 0.2 }));
    return () => cancelAnimationFrame(frame);
  }, [layoutKey]);

  const empty = !tree || tree.nodes.length === 0;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-bg-panel ${empty ? 'h-96' : 'h-[76vh]'}`}
    >
      {empty ? (
        <EmptyState error={tree?.error} />
      ) : (
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance: ReactFlowInstance) => {
            instanceRef.current = instance;
          }}
          fitView
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={[20, 20]} color="#2e3138" />
          <MiniMap nodeColor={miniNodeColor} maskColor="rgba(11,12,16,0.65)" pannable position="top-right" />
          <Controls position="bottom-right" />
          <Panel position="bottom-left">
            <button
              type="button"
              onClick={() => instanceRef.current?.fitView({ padding: 0.2 })}
              className="rounded-md border border-border bg-bg-card px-2.5 py-1 text-xs text-text-secondary hover:bg-border hover:text-text-primary"
            >
              Fit view
            </button>
            <button
              type="button"
              onClick={() => {
                setTreeMode((v) => !v);
                setLayoutKey((k) => k + 1);
              }}
              className={`ml-2 rounded-md border border-border px-2.5 py-1 text-xs ${treeMode ? 'text-white' : 'bg-bg-card text-text-secondary'} hover:bg-border hover:text-text-primary`}
              style={treeMode ? { backgroundColor: 'var(--color-tree-toggle)' } : undefined}
            >
              {treeMode ? 'Tree: ON' : 'Tree: OFF'}
            </button>
          </Panel>
        </ReactFlow>
      )}
    </div>
  );
}

function EmptyState({ error }: { error?: string }) {
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center">
      <p className="max-w-sm text-text-secondary">
        Select a target item and enter a production rate to see its production tree.
      </p>
    </div>
  );
}
