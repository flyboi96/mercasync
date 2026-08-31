export type UnitDimension = 'count' | 'mass' | 'volume' | 'package' | 'unknown';

const UNIT_ALIASES: Record<string, string> = {
  each: 'each', item: 'each', items: 'each', count: 'each', piece: 'each', pieces: 'each',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb',
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  can: 'can', cans: 'can', bag: 'bag', bags: 'bag', package: 'package', packages: 'package', pack: 'package',
};

const ITEM_ALIASES: Record<string, string> = {
  yogurt: 'greek-yogurt', 'greek-yoghurt': 'greek-yogurt',
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
  if (normalized === 'cup' || normalized === 'tbsp' || normalized === 'tsp') return 'volume';
  if (normalized === 'can' || normalized === 'bag' || normalized === 'package') return 'package';
  return 'unknown';
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;
  if (unitDimension(from) !== unitDimension(to)) return null;
  const base: Record<string, number> = { oz: 1, lb: 16, tsp: 1, tbsp: 3, cup: 48 };
  if (!(from in base) || !(to in base)) return null;
  return Math.round(quantity * base[from] / base[to] * 100) / 100;
}

const ITEM_UNIT_EQUIVALENTS: Record<string, { unit: string; baseQuantity: number }[]> = {
  almonds: [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 / 5 }],
  'baby-spinach': [{ unit: 'oz', baseQuantity: 1 }, { unit: 'cup', baseQuantity: 1 }],
};

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
