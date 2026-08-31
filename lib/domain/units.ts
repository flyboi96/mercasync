export type UnitDimension = 'count' | 'mass' | 'volume' | 'package' | 'unknown';

const UNIT_ALIASES: Record<string, string> = {
  each: 'each', item: 'each', items: 'each', count: 'each', piece: 'each', pieces: 'each',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb',
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'fl oz': 'fl oz', floz: 'fl oz',
  can: 'can', cans: 'can', bag: 'bag', bags: 'bag', package: 'package', packages: 'package', pack: 'package',
};

const ITEM_ALIASES: Record<string, string> = {
  yogurt: 'greek-yogurt', 'greek-yoghurt': 'greek-yogurt',
  'rolled-oats': 'quick-oats',
  'baby-spinach-or-romaine-greens': 'baby-spinach',
  cucumbers: 'cucumber', eggs: 'eggs',
  'chicken-breasts': 'chicken-breast', 'chicken-thigh': 'chicken-thighs',
};

export function normalizeUnit(unit: string) {
  const clean = unit.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[clean] || clean;
}

export function canonicalItemId(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ITEM_ALIASES[slug] || slug;
}

export function unitDimension(unit: string): UnitDimension {
  const normalized = normalizeUnit(unit);
  if (normalized === 'each') return 'count';
  if (normalized === 'oz' || normalized === 'lb') return 'mass';
  if (normalized === 'cup' || normalized === 'tbsp' || normalized === 'tsp' || normalized === 'fl oz') return 'volume';
  if (normalized === 'can' || normalized === 'bag' || normalized === 'package') return 'package';
  return 'unknown';
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;
  if (unitDimension(from) !== unitDimension(to)) return null;
  const base: Record<string, number> = { oz: 1, lb: 16, tsp: 1, tbsp: 3, 'fl oz': 6, cup: 48 };
  if (!(from in base) || !(to in base)) return null;
  return Math.round(quantity * base[from] / base[to] * 100) / 100;
}

const ITEM_UNIT_EQUIVALENTS: Record<string, { unit: string; baseQuantity: number }[]> = {
  almonds: [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 / 5 }],
  'baby-spinach': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 }],
  'greek-yogurt': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 / 8 }],
  honey: [{ unit: 'oz', baseQuantity: 1 }, { unit: 'tbsp', baseQuantity: 4 / 3 }],
  'quick-oats': [{ unit: 'bag', baseQuantity: 10 }, { unit: 'cup', baseQuantity: 1 }],
  'chia-seeds': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'tbsp', baseQuantity: 2 }],
  'pumpkin-seeds': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 / 4 }],
  pecans: [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 / 4 }],
  'whey-protein': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'scoop', baseQuantity: 1 / 30 }],
  'chicken-breast': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'lb', baseQuantity: 16 }],
  'chicken-thighs': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'lb', baseQuantity: 16 }],
  'ground-beef': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'lb', baseQuantity: 16 }],
  salmon: [{ unit: 'oz', baseQuantity: 1 }, { unit: 'lb', baseQuantity: 16 }],
  'olive-oil': [{ unit: 'each', baseQuantity: 32 }, { unit: 'tbsp', baseQuantity: 1 }],
  'soy-sauce': [{ unit: 'each', baseQuantity: 32 }, { unit: 'tbsp', baseQuantity: 1 }],
};

// One canonical unit per common household item. This keeps recipes, grocery
// receipts, and inventory in the same measurement system. Unknown items keep
// their entered unit rather than guessing an unsafe food-density conversion.
const STANDARD_UNITS: Record<string, string> = {
  'chicken-breast': 'oz', 'chicken-thighs': 'oz', 'ground-beef': 'oz', salmon: 'oz', 'deli-ham': 'oz',
  'greek-yogurt': 'oz', milk: 'fl oz', 'havarti-cheese': 'oz', 'swiss-cheese': 'oz',
  almonds: 'oz', pecans: 'oz', 'pumpkin-seeds': 'oz', 'chia-seeds': 'oz', 'flax-seeds': 'oz',
  'quick-oats': 'cup', 'whey-protein': 'oz', honey: 'oz', 'peanut-butter': 'oz',
  'olive-oil': 'fl oz', 'soy-sauce': 'fl oz', 'white-wine-vinegar': 'fl oz', 'lime-juice': 'fl oz',
  'teriyaki-sauce': 'fl oz', 'oyster-sauce': 'fl oz', 'bulgogi-sauce': 'fl oz',
  eggs: 'each', bananas: 'each', cucumber: 'each', zucchini: 'each', 'red-onion': 'each',
  jalapenos: 'each', peach: 'each', 'green-pepper': 'each', 'cherry-tomatoes': 'oz',
  'baby-spinach': 'oz', 'corn-tortillas': 'each', 'wheat-tortillas': 'each', 'sourdough-bread': 'oz',
  'canned-corn': 'can', 'canned-beans': 'can', 'canned-chickpeas': 'can',
  'penne-pasta': 'oz', quinoa: 'oz', 'basmati-rice': 'oz', 'legume-rice': 'oz',
  '409-cleaner': 'each', 'kitchen-plug': 'each', shampoo: 'each',
};

export function standardUnitForItem(itemId: string, fallbackUnit: string) {
  return STANDARD_UNITS[canonicalItemId(itemId)] || normalizeUnit(fallbackUnit);
}

export function standardizeItemQuantity(itemId: string, quantity: number, unit: string) {
  const normalizedUnit = normalizeUnit(unit);
  const standardUnit = standardUnitForItem(itemId, normalizedUnit);
  const converted = convertItemQuantity(itemId, quantity, normalizedUnit, standardUnit);
  return { quantity: converted == null ? quantity : converted, unit: converted == null ? normalizedUnit : standardUnit };
}

export function convertItemQuantity(itemId: string, quantity: number, fromUnit: string, toUnit: string): number | null {
  const standard = convertQuantity(quantity, fromUnit, toUnit);
  if (standard != null) return standard;
  const equivalents = ITEM_UNIT_EQUIVALENTS[canonicalItemId(itemId)];
  const from = equivalents?.find((entry) => convertQuantity(quantity, fromUnit, entry.unit) != null);
  const to = equivalents?.find((entry) => entry.unit === normalizeUnit(toUnit));
  if (!from || !to) return null;
  const normalizedQuantity = convertQuantity(quantity, fromUnit, from.unit);
  if (normalizedQuantity == null) return null;
  return Math.round(normalizedQuantity / from.baseQuantity * to.baseQuantity * 100) / 100;
}
