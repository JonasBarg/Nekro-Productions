import { useMemo } from 'react';
import { useTree } from '../stores/plannerStore';
import { getItem, getBuilding } from '../data';
import { formatRate } from '../utils/formatters';
import { Package, RefreshCw } from 'lucide-react';

export default function SummaryPanel() {
  const tree = useTree();

  const summary = useMemo(() => {
    const byMachine = new Map<string, { name: string; count: number; power: number }>();

    for (const n of tree.nodes) {
      if (n.isRaw) continue;
      const bld = n.building;
      const bldName = getBuilding(bld)?.name ?? bld;
      const prev = byMachine.get(bld) ?? { name: bldName, count: 0, power: 0 };
      prev.count += n.machines;
      prev.power += n.power;
      byMachine.set(bld, prev);
    }

    const raw = tree.rawResources
      .map((r) => ({ item: getItem(r.itemId), rate: r.rate }))
      .filter((r) => r.item)
      .sort((a, b) => (a.item?.name ?? '').localeCompare(b.item?.name ?? ''));

    const byProducts = tree.byproducts
      .map((b) => ({ item: getItem(b.itemId), rate: b.rate }))
      .filter((b) => b.item)
      .sort((a, b) => (a.item?.name ?? '').localeCompare(b.item?.name ?? ''));

    const totalPower = tree.totalPower;
    const totalMachines = tree.totalMachines;

    return {
      byMachine: [...byMachine.values()],
      raw,
      byProducts,
      totalPower,
      totalMachines,
    };
  }, [tree]);

  return (
    <aside className="flex w-full flex-col gap-4">
      <Card title="Raw resources" icon={<Package className="h-4 w-4 text-raw" />}>
        {summary.raw.length === 0 ? (
          <p className="text-xs text-text-secondary">No raw resources required.</p>
        ) : (
          <ul className="space-y-1">
            {summary.raw.map((r) => (
              <li key={r.item!.id} className="flex justify-between">
                <span className="text-sm text-text-secondary">{r.item!.name}</span>
                <span className="text-sm font-medium font-mono text-text-primary">{formatRate(r.rate, r.item, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {summary.byProducts.length > 0 && (
        <Card title="By-products" icon={<RefreshCw className="h-4 w-4 text-fluid" />}>
          <ul className="space-y-1">
            {summary.byProducts.map((b) => (
              <li key={b.item!.id} className="flex justify-between">
                <span className="text-sm text-text-secondary">{b.item!.name}</span>
                <span className="text-sm font-medium font-mono text-text-primary">{formatRate(b.rate, b.item, true)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tree.error && <p className="text-xs text-danger">{tree.error}</p>}
    </aside>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">{title}</span>
      </div>
      {children}
    </div>
  );
}
