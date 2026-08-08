import type { Recipe, Item } from '../data/types';
import { getItem, getDefaultRecipe, getRecipe, isRaw as isRawItem } from '../data';
import { byproductRates } from '../utils/rates';

export type ClockMap = Record<string, number>; // recipeId -> load (1..2.5)

export type TreeNode = {
  itemId: string;
  item: Item;
  rate: number; // per minute (items or m³ for fluids)
  recipeId: string | null;
  recipe: Recipe | null;
  machines: number;
  building: string;
  power: number; // MW
  isRaw: boolean;
  isTarget: boolean;
  clock: number;
  ingredients: Array<{ itemId: string; rate: number }>;
};

export type Flow = { from: string; to: string; rate: number };

export type TreeResult = {
  nodes: TreeNode[];
  flows: Flow[];
  totalPower: number;
  totalMachines: number;
  rawResources: Array<{ itemId: string; rate: number }>;
  byproducts: Array<{ itemId: string; rate: number }>;
  error?: string;
};

export type TreeInput = {
  targetItemId: string;
  targetRate: number; // per minute
  recipePrefs: Record<string, string>; // itemId -> recipeId
  clockPrefs: ClockMap; // recipeId -> load
};

// Resolve the chosen recipe for an item: prefer explicit preference if valid, else default.
function resolveRecipe(itemId: string, recipePrefs: Record<string, string>): Recipe | undefined {
  const pref = recipePrefs[itemId];
  if (pref) {
    const r = getRecipe(pref);
    if (r && r.products[0]?.id === itemId) return r;
  }
  return getDefaultRecipe(itemId);
}

// DFS to collect every item reachable from target via chosen recipes' ingredients.
// removed unused helper functions `collectTree` and `topoSort`

export function calculateTree(input: TreeInput): TreeResult {
  const { targetItemId, targetRate, recipePrefs, clockPrefs } = input;
  const target = getItem(targetItemId);
  if (!target) {
    return emptyResult('Item not found.');
  }
  const targetRecipe = resolveRecipe(targetItemId, recipePrefs);
  if (!targetRecipe) {
    return emptyResult(`No recipe produces "${target.name}".`);
  }

  const visited = new Set<string>();
  const chosenRecipe = new Map<string, Recipe | undefined>();
  const stack: string[] = [targetItemId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const recipe = resolveRecipe(id, recipePrefs);
    chosenRecipe.set(id, recipe);

    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      if (!visited.has(ing.id)) stack.push(ing.id);
    }
  }

  const order: string[] = [];
  const done = new Set<string>();
  const visit = (id: string) => {
    if (done.has(id)) return;
    done.add(id);
    const recipe = chosenRecipe.get(id);
    if (recipe) {
      for (const ing of recipe.ingredients) {
        if (visited.has(ing.id)) visit(ing.id);
      }
    }
    order.push(id);
  };
  for (const id of visited) visit(id);
  order.reverse();

  const demand = new Map<string, number>();
  demand.set(targetItemId, targetRate);

  const nodes = new Map<string, TreeNode>();
  const byproductTotals = new Map<string, number>();

  const mainRatePerMin = (recipe: Recipe) => (recipe.products[0].amount / recipe.time) * 60;
  const ingredientRatePerMin = (recipe: Recipe, index: number) => (recipe.ingredients[index].amount / recipe.time) * 60;

  for (const id of order) {
    const item = getItem(id) ?? ({ id, name: id, slug: id, icon: '', isFluid: false, category: 'intermediate', isRaw: false } as Item);
    const recipe = chosenRecipe.get(id);
    const isRaw = !recipe || isRawItem(id);
    const d = demand.get(id) ?? 0;

    if (isRaw || !recipe) {
      nodes.set(id, {
        itemId: id,
        item,
        rate: d,
        recipeId: null,
        recipe: null,
        machines: 0,
        building: 'Resource',
        power: 0,
        isRaw: true,
        isTarget: id === targetItemId,
        clock: 1,
        ingredients: [],
      });
      continue;
    }

    const load = clockPrefs[recipe.id] ?? 1;
    const ratePerMachine = mainRatePerMin(recipe) * load;
    const m = ratePerMachine > 0 ? d / ratePerMachine : 0;

    const ingredients: Array<{ itemId: string; rate: number }> = [];
    const powerPerMachine = recipe.buildingPowerMW * Math.pow(load, recipe.exponent || 1.321928743);

    for (let idx = 0; idx < recipe.ingredients.length; idx++) {
      const ing = recipe.ingredients[idx];
      const rate = m * ingredientRatePerMin(recipe, idx) * load;
      ingredients.push({ itemId: ing.id, rate });
      demand.set(ing.id, (demand.get(ing.id) ?? 0) + rate);
    }

    for (const bp of byproductRates(recipe, load)) {
      byproductTotals.set(bp.id, (byproductTotals.get(bp.id) ?? 0) + m * bp.rate);
    }

    nodes.set(id, {
      itemId: id,
      item,
      rate: d,
      recipeId: recipe.id,
      recipe,
      machines: m,
      building: recipe.building,
      power: m * powerPerMachine,
      isRaw: false,
      isTarget: id === targetItemId,
      clock: load,
      ingredients,
    });
  }

  const flowTotals = new Map<string, number>();
  for (const node of nodes.values()) {
    if (node.isRaw) continue;
    for (const ing of node.ingredients) {
      const key = `${ing.itemId}->${node.itemId}`;
      flowTotals.set(key, (flowTotals.get(key) ?? 0) + ing.rate);
    }
  }
  const flows: Flow[] = [];
  for (const [key, rate] of flowTotals) {
    const [from, to] = key.split('->');
    flows.push({ from, to, rate });
  }

  const rawResources: Array<{ itemId: string; rate: number }> = [];
  const byproducts: Array<{ itemId: string; rate: number }> = [];
  for (const [id, rate] of byproductTotals) {
    if (rate > 0.000001) byproducts.push({ itemId: id, rate });
  }
  for (const [id, rate] of demand) {
    if (rate > 0.000001 && isRawItem(id) && nodes.get(id)?.isRaw) {
      rawResources.push({ itemId: id, rate });
    }
  }

  const totalPower = [...nodes.values()].reduce((s, n) => s + n.power, 0);
  const totalMachines = [...nodes.values()].reduce((s, n) => s + n.machines, 0);

  return {
    nodes: [...nodes.values()],
    flows,
    totalPower,
    totalMachines,
    rawResources,
    byproducts,
  };
}

function emptyResult(error?: string): TreeResult {
  return {
    nodes: [],
    flows: [],
    totalPower: 0,
    totalMachines: 0,
    rawResources: [],
    byproducts: [],
    error,
  };
}
