import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { TreeNode } from '../utils/calculateTree';
import { formatRate } from '../utils/formatters';

export type GraphTreeNode = TreeNode & { isByproduct?: boolean };
export type ItemNode = Node<{ tree: GraphTreeNode }, 'itemNode'>;

const CATEGORY_COLOR: Record<string, string> = {
  raw: 'border-raw',
  fluid: 'border-fluid',
  intermediate: 'border-text-secondary/40',
};

const BG_BY_CATEGORY: Record<string, string> = {
  raw: 'bg-raw/15',
  fluid: 'bg-fluid/15',
  intermediate: 'bg-bg-panel',
};

export default function CustomNode({ data }: NodeProps<ItemNode>) {
  const node = data.tree;
  const item = node.item;
  const isByproduct = node.isByproduct ?? false;
  const isTarget = node.isTarget;
  const isFluid = item.isFluid ?? false;
  const effectiveCategory = isFluid && !node.isRaw ? 'intermediate' : item.category;

  // Priority: target > raw/source > byproduct > intermediate/other
  let color: string;
  let bg: string;
  if (isTarget) {
    color = 'border-product';
    bg = 'bg-product/10';
  } else if (node.isRaw) {
    const cat = isFluid ? 'fluid' : 'raw';
    color = CATEGORY_COLOR[cat] ?? 'border-text-secondary/40';
    bg = BG_BY_CATEGORY[cat] ?? 'bg-bg-panel';
  } else if (isByproduct) {
    color = 'border-alt';
    bg = 'bg-alt/10';
  } else {
    color = CATEGORY_COLOR[effectiveCategory] ?? 'border-text-secondary/40';
    bg = BG_BY_CATEGORY[effectiveCategory] ?? 'bg-bg-panel';
  }
  const targetHighlight = node.isTarget ? '' : 'hover:ring-1 hover:ring-text-secondary/30';
  const targetStyle: React.CSSProperties | undefined = node.isTarget
    ? {
        borderColor: 'var(--color-product)',
        boxShadow: '0 0 0 6px rgba(239,68,68,0.12)',
        outline: '2px solid rgba(239,68,68,0.06)',
      }
    : undefined;

  return (
    <div
      style={targetStyle}
      className={`relative flex flex-col gap-0.5 rounded-xl border-2 ${color} ${bg} px-3.5 py-2.5 text-sm shadow-sm transition-all w-[160px] ${targetHighlight}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={node.isTarget ? { background: 'var(--color-product)', borderColor: 'var(--color-product)' } : undefined}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={node.isTarget ? { background: 'var(--color-product)', borderColor: 'var(--color-product)' } : undefined}
      />

      <div className="flex items-center gap-2">
        <span
          className="truncate font-medium"
          title={item.name}
          style={node.isTarget ? { color: 'var(--color-product)' } : undefined}
        >
          {item.name}
        </span>
      </div>

      <div className="mt-1">
        <span className="font-semibold text-text-primary">{formatRate(node.rate, item, true)}</span>
      </div>
    </div>
  );
}
