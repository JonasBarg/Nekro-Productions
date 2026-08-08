import { usePlannerStore } from '../stores/plannerStore';
import { availableVariants } from '../data';

export default function ModifierSelector() {
  const variant = usePlannerStore((s) => s.recipeVariant);
  const setVariant = usePlannerStore((s) => s.setVariant);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-text-secondary">Modifier</label>
      <div className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-3 py-2 shadow-sm">
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          className="w-20 border-none bg-bg-panel text-base text-text-primary outline-none"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {availableVariants.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
