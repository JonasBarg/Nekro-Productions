import data from './gameData.json';
import recipesFile1 from './recipes_1.json';
import recipesFile075 from './recipes_0_75.json';
import type { GameData, Item, Building, Recipe } from './types';

const typed = data as GameData;

const itemMap = new Map<string, Item>(typed.items.map((i) => [i.id, i]));
const itemNameToId = new Map<string, string>(typed.items.map((i) => [i.name, i.id]));
const buildingMap = new Map<string, Building>(typed.buildings.map((b) => [b.id, b]));

type RawRecipesFile = {
  multiplier: number;
  generatedAt: string;
  data: Record<
    string,
    Array<{
      name: string;
      products: Array<{ item: string; rate: number }>;
      ingredients: Array<{ item: string; rate: number }>;
    }>
  >;
};

function slugifyForId(s: string) {
  return s.replace(/^Alt:\s*/i, 'Alt_').replace(/[^A-Za-z0-9]+/g, '_');
}

function convertRecipes(raw: RawRecipesFile): Recipe[] {
  const out: Recipe[] = [];
  for (const [_title, recs] of Object.entries(raw.data)) {
    for (const r of recs) {
      const alt = /^Alt:/i.test(r.name);
      const id = `Recipe_${slugifyForId(r.name)}`;
      const time = 60; // use 60s so amounts equal per-minute rates
      const products = r.products.map((p) => ({ id: itemNameToId.get(p.item) ?? p.item, amount: p.rate }));
      const ingredients = r.ingredients.map((ing) => ({ id: itemNameToId.get(ing.item) ?? ing.item, amount: ing.rate }));
      out.push({
        id,
        name: r.name,
        alt,
        time,
        ingredients,
        products,
        building: '',
        buildingPowerMW: 0,
        exponent: 1,
      });
    }
  }
  return out;
}

const raw1 = recipesFile1 as unknown as RawRecipesFile;
const raw075 = recipesFile075 as unknown as RawRecipesFile;
const convertedRecipesByVariant: Record<string, Recipe[]> = {
  '1.0': convertRecipes(raw1),
  '0.75': convertRecipes(raw075),
};

let currentVariant = '1.0';
let convertedRecipes = convertedRecipesByVariant[currentVariant];

// recipes whose main product (products[0]) is the given item
let recipesByItem = new Map<string, Recipe[]>();
let recipeMap = new Map<string, Recipe>();

function buildRecipeIndexes() {
  recipesByItem = new Map<string, Recipe[]>();
  for (const r of convertedRecipes) {
    if (r.products.length === 0) continue;
    const main = r.products[0].id;
    const arr = recipesByItem.get(main) ?? [];
    if (!arr.some((ex) => ex.id === r.id)) {
      arr.push(r);
    }
    recipesByItem.set(main, arr);
  }

  recipeMap = new Map<string, Recipe>(convertedRecipes.map((r) => [r.id, r]));
}

buildRecipeIndexes();

const sortedItems = [...itemMap.values()].sort((a, b) => a.name.localeCompare(b.name));

export function getItem(id: string): Item | undefined {
  return itemMap.get(id);
}

export function getBuilding(id: string): Building | undefined {
  return buildingMap.get(id);
}

export function getRecipe(id: string): Recipe | undefined {
  return recipeMap.get(id);
}

export function getRecipesForItem(itemId: string): Recipe[] {
  return recipesByItem.get(itemId) ?? [];
}

// The default recipe for an item: prefer non-alternate, then by shortest time.
export function getDefaultRecipe(itemId: string): Recipe | undefined {
  const recipes = getRecipesForItem(itemId);
  if (recipes.length === 0) return undefined;
  const item = itemMap.get(itemId);
  const name = item?.name ?? '';

  // Prefer recipes whose name matches the item name exactly.
  const normalized = (s: string) => s.replace(/^Alt:\s*/i, '').trim();
  const exactMatches = recipes.filter((r) => normalized(r.name) === name);
  if (exactMatches.length > 0) {
    // prefer non-alt exact match, else alt exact match
    const nonAlt = exactMatches.find((r) => !r.alt);
    if (nonAlt) return nonAlt;
    return exactMatches[0];
  }

  // otherwise prefer any non-alt recipe (shortest time), else any alt (shortest time)
  const standard = recipes.filter((r) => !r.alt);
  const pool = standard.length ? standard : recipes;
  return pool.reduce((best, r) => (r.time < best.time ? r : best));
}

// A recipe is usable as a target/product if it produces the item as its main product.
export function isCraftable(itemId: string): boolean {
  return recipesByItem.has(itemId);
}

export function isRaw(itemId: string): boolean {
  const item = itemMap.get(itemId);
  if (item) return item.isRaw;
  return false;
}

export function itemRatePerSecond(recipe: Recipe, index = 0): number {
  return recipe.products[index].amount / recipe.time;
}

export function itemRatePerMinute(recipe: Recipe, index = 0): number {
  return (recipe.products[index].amount / recipe.time) * 60;
}

export const allItems = sortedItems;
export const allRecipes = () => convertedRecipes;
export const allBuildings = typed.buildings;

export function setRecipeVariant(variant: string) {
  if (!convertedRecipesByVariant[variant]) return;
  currentVariant = variant;
  convertedRecipes = convertedRecipesByVariant[variant];
  buildRecipeIndexes();
}

export function getRecipeVariant(): string {
  return currentVariant;
}

export const availableVariants = Object.keys(convertedRecipesByVariant);
