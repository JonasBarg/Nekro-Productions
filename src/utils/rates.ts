import type { Recipe } from '../data/types';
import { itemRatePerMinute } from '../data';

const DEFAULT_EXPONENT = 1.321928743; // log2(2.5), vanilla crafting buildings

// Satisfactory power curve: powerFactor = load^exponent, where load = clock/100.
// Validated against wiki table (50% => 40%, 200% => 250%, 250% => 335.77%).
export function powerFactor(load: number, exponent = DEFAULT_EXPONENT): number {
  return Math.pow(load, exponent);
}

export function buildingPowerMW(recipe: Recipe, load: number): number {
  return recipe.buildingPowerMW * powerFactor(load, recipe.exponent || DEFAULT_EXPONENT);
}

export function machinesNeeded(demandPerMin: number, recipe: Recipe, load: number): number {
  const perMachine = itemRatePerMinute(recipe) * load;
  if (perMachine <= 0) return 0;
  return demandPerMin / perMachine;
}

export function ingredientRatePerMin(recipe: Recipe, ingredientIndex: number, load: number): number {
  const r = recipe.ingredients[ingredientIndex];
  return (r.amount / recipe.time) * 60 * load;
}

export function productRatePerMin(recipe: Recipe, productIndex: number, load: number): number {
  return itemRatePerMinute(recipe, productIndex) * load;
}

export function byproductRates(recipe: Recipe, load: number): Array<{ id: string; rate: number }> {
  return recipe.products.slice(1).map((p) => ({
    id: p.id,
    rate: (p.amount / recipe.time) * 60 * load,
  }));
}

export function fmt(v: number, opts?: { decimals?: number; compact?: boolean }): string {
  const d = opts?.decimals ?? 2;
  if (opts?.compact && Math.abs(v) >= 1000) {
    return (v / 1000).toFixed(2) + 'k';
  }
  return v.toFixed(d);
}
