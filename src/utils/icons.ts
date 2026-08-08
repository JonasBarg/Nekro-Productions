import type { Item } from '../data/types';

// No external icon assets: use emoji glyphs keyed by category / building.
// This keeps the app fully self-contained while still being readable.

export const ITEM_ICON: Record<string, string> = {
  raw: '⛏️',
  fluid: '💧',
  intermediate: '🔩',
  product: '📦',
};

export function iconForItem(item: Item): string {
  if (item.isFluid) return '💧';
  if (item.isRaw) return '⛏️';
  return '🔩';
}

export const BUILDING_ICON: Record<string, string> = {
  Constructor: '⚙️',
  Smelter: '🔥',
  Foundry: '🪨',
  Assembler: '🔧',
  Manufacturer: '🏭',
  Packager: '🔄',
  Refinery: '🛢️',
  Blender: '🧪',
  'Water Extractor': '🌊',
  'Oil Extractor': '🛢️',
  'Chemical Lab': '🧫',
  'Particle Accelerator': '⚡',
  Converter: '🔁',
  'Quantum Encoder': '🌀',
  'Resource': '⛏️',
};

export function iconForBuilding(name: string): string {
  return BUILDING_ICON[name] ?? '🏭';
}

export function buildingColor(name: string): string {
  // tailwind color name used for the node accent
  switch (name) {
    case 'Constructor':
    case 'Smelter':
    case 'Foundry':
      return 'product';
    case 'Assembler':
    case 'Manufacturer':
      return 'alt';
    case 'Packager':
    case 'Refinery':
    case 'Blender':
    case 'Water Extractor':
    case 'Oil Extractor':
      return 'fluid';
    case 'Chemical Lab':
      return 'raw';
    case 'Particle Accelerator':
    case 'Converter':
    case 'Quantum Encoder':
      return 'danger';
    default:
      return 'accent';
  }
}
