import { usePlannerStore } from '../stores/plannerStore';
import { calculateTree } from '../utils/calculateTree';
import { useMemo } from 'react';
import { getRecipesForItem } from '../data';
import { Wrench } from 'lucide-react';

export default function RecipeSelector() {
  const targetItemId = usePlannerStore((s) => s.targetItemId);
  const targetRate = usePlannerStore((s) => s.targetRate);
  const recipePrefs = usePlannerStore((s) => s.recipePrefs);
  const clockPrefs = usePlannerStore((s) => s.clockPrefs);

  const tree = useMemo(
    () => calculateTree({ targetItemId: targetItemId!, targetRate, recipePrefs, clockPrefs }),
    [targetItemId, targetRate, recipePrefs, clockPrefs]
  );
  const setRecipe = usePlannerStore((s) => s.setRecipe);

  const EPS = 1e-6;
  const productionNodes = tree.nodes.filter((n) => !n.isRaw && (Math.abs(n.rate) > EPS || n.isTarget));

  if (productionNodes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-yellow-400" />
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Recipes</span>
      </div>

      <ul className="space-y-3">
        {productionNodes.map((n) => {
          const options = getRecipesForItem(n.itemId);
          return (
            <li key={n.itemId} className="flex items-center justify-between text-sm gap-2">
              <span className="text-text-primary">{n.item.name}</span>
              <select
                value={n.recipe?.id ?? ''}
                onChange={(e) => setRecipe(n.itemId, e.target.value)}
                className="ml-2 rounded-md border border-border bg-bg-panel px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent w-44 text-left"
                style={{ textAlign: 'left' }}
              >
                        {options
                          .filter(
                            (r) =>
                              !/^unpackage/i.test(r.name) &&
                              !/^Recipe_Unpackage/i.test(r.id) &&
                              !/byproduct/i.test(r.name)
                          )
                          .map((r) => {
                            const baseName = r.name.replace(/^(Alt:|Alternate:)\s*/i, '');
                            const display = (r.alt ? 'Alt: ' : '') + baseName;
                            return (
                              <option key={r.id} value={r.id}>
                                {display}
                              </option>
                            );
                          })}
                {options.length === 0 && <option value="">No recipe</option>}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
