export type Item = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  isFluid: boolean;
  category: 'raw' | 'fluid' | 'intermediate';
  isRaw: boolean;
};

export type Building = {
  id: string;
  name: string;
  powerMW: number;
  exponent: number;
  speed: number;
  icon: string;
};

export type Ingredient = { id: string; amount: number };
export type Product = { id: string; amount: number };

export type Recipe = {
  id: string;
  name: string;
  alt: boolean;
  time: number;
  ingredients: Ingredient[];
  products: Product[];
  building: string;
  buildingPowerMW: number;
  exponent: number;
};

export type GameData = {
  meta: { source: string; generated: string };
  items: Item[];
  buildings: Building[];
  recipes: Recipe[];
};
