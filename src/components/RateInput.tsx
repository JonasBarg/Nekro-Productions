import { usePlannerStore } from '../stores/plannerStore';

export default function RateInput() {
  const rate = usePlannerStore((s) => s.targetRate);
  const setRate = usePlannerStore((s) => s.setRate);
  const label = '/min';
  const value = rate <= 0 ? '' : String(rate);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-text-secondary">Rate</label>
      <div className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-3 py-2 shadow-sm">
        <input
          type="number"
          min={0}
          step={0.1}
          value={value}
          onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
          placeholder="10"
          className="w-20 border-none bg-transparent text-base text-text-primary outline-none placeholder:text-text-secondary/50 no-spin"
          inputMode="decimal"
        />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
    </div>
  );
}
