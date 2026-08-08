import { create } from 'zustand';
import { useMemo } from 'react';
import { subscribeWithSelector } from 'zustand/middleware';
import { calculateTree } from '../utils/calculateTree';
import type { TreeResult } from '../utils/calculateTree';
import { getDefaultRecipe, getRecipe, getItem, isCraftable, setRecipeVariant, getRecipeVariant } from '../data';
import type { Item, Recipe } from '../data/types';

export const DEFAULT_TARGET = 'Desc_Computer_C'; // Computer
export const DEFAULT_RATE = 10;

export type PlannerState = {
  targetItemId: string | null;
  targetRate: number;
  recipePrefs: Record<string, string>;
  clockPrefs: Record<string, number>;
  recipeVariant: string;
};

export type PlannerActions = {
  setTarget: (itemId: string | null) => void;
  setRate: (rate: number) => void;
  setRecipe: (itemId: string, recipeId: string) => void;
  setClock: (recipeId: string, load: number) => void;
  setVariant: (variant: string) => void;
  resetClock: (recipeId: string) => void;
  resetAllClocks: () => void;
  resetRecipe: (itemId: string) => void;
  resetRecipes: () => void;
};

export type PlannerStore = PlannerState & PlannerActions;

function omit<T extends object>(obj: T, key: PropertyKey): T {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as T;
}

export const usePlannerStore = create<PlannerStore>()(
  subscribeWithSelector((set) => ({
    targetItemId: DEFAULT_TARGET,
    targetRate: DEFAULT_RATE,
    recipePrefs: {},
    clockPrefs: {},
    recipeVariant: getRecipeVariant(),
    setTarget: (itemId) => set({ targetItemId: itemId }),
    setRate: (rate) => set({ targetRate: rate }),
    setRecipe: (itemId, recipeId) =>
      set((s) => ({ recipePrefs: { ...s.recipePrefs, [itemId]: recipeId } })),
    setVariant: (variant: string) => {
      setRecipeVariant(variant);
      set({ recipeVariant: variant });
    },
    setClock: (recipeId, load) =>
      set((s) => ({ clockPrefs: { ...s.clockPrefs, [recipeId]: load } })),
    resetClock: (recipeId) => set((s) => ({ clockPrefs: omit(s.clockPrefs, recipeId) })),
    resetAllClocks: () => set({ clockPrefs: {} }),
    resetRecipe: (itemId) => set((s) => ({ recipePrefs: omit(s.recipePrefs, itemId) })),
    resetRecipes: () => set({ recipePrefs: {} }),
  }))
);

// Selectors
export function useTargetItem(): Item | null {
  const target = usePlannerStore((s) => s.targetItemId);
  return target ? getItem(target) ?? null : null;
}

export function useTargetRate(): number {
  return usePlannerStore((s) => s.targetRate);
}

export function useTree(): TreeResult {
  const targetItemId = usePlannerStore((s) => s.targetItemId);
  const targetRate = usePlannerStore((s) => s.targetRate);
  const recipePrefs = usePlannerStore((s) => s.recipePrefs);
  const clockPrefs = usePlannerStore((s) => s.clockPrefs);
  const recipeVariant = usePlannerStore((s) => s.recipeVariant);

  return useMemo(
    () => computeTree({ targetItemId, targetRate, recipePrefs, clockPrefs }),
    [targetItemId, targetRate, recipePrefs, clockPrefs, recipeVariant]
  );
}

export function useRecipePrefs(): Record<string, string> {
  return usePlannerStore((s) => s.recipePrefs);
}

export function useClockPref(recipeId: string): number {
  return usePlannerStore((s) => s.clockPrefs[recipeId] ?? 1);
}

export function chosenRecipeFor(itemId: string, recipePrefs: Record<string, string>): Recipe | undefined {
  const pref = recipePrefs[itemId];
  if (pref) {
    const r = getRecipe(pref);
    if (r && r.products[0]?.id === itemId) return r;
  }
  return getDefaultRecipe(itemId);
}

function computeTree(state: Omit<PlannerState, 'recipeVariant'>): TreeResult {
  if (!state.targetItemId || !isCraftable(state.targetItemId)) {
    return {
      nodes: [],
      flows: [],
      totalPower: 0,
      totalMachines: 0,
      rawResources: [],
      byproducts: [],
      error: 'Select a craftable target item.',
    };
  }
  return calculateTree({
    targetItemId: state.targetItemId,
    targetRate: state.targetRate,
    recipePrefs: state.recipePrefs,
    clockPrefs: state.clockPrefs,
  });
}
