import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';
import { effectiveInventoryQuantity, type InventoryItem } from './inventory';
import { RECURRING_PROFILES, recurringProfileOccurrences, type RecurringConsumptionProfile } from './recurring-consumption';

export type GroceryNeed = {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  store: 'King Soopers' | 'Costco';
  inventoryUsed: number;
  sources: string[];
};

export type GroceryRunItem = GroceryNeed & {
  checked: boolean;
  purchasedQuantity: number;
  purchasedAt: string | null;
  manual?: boolean;
  note?: string;
};

const storeNames = {
  king_soopers: 'King Soopers',
  costco: 'Costco',
} as const;

function rounded(quantity: number) {
  return Math.round(quantity * 100) / 100;
}

export function groceryNeedsFingerprint(needs: GroceryNeed[]) {
  return JSON.stringify(needs.map(({ id, quantity, inventoryUsed, sources }) => ({ id, quantity, inventoryUsed, sources })));
}

export function mergeGroceryRunItems(needs: GroceryNeed[], existing: GroceryRunItem[]) {
  const preserved = existing.filter((item) => item.checked || item.manual);
  const checkedIds = new Set(preserved.map((item) => item.id));
  const pending = needs
    .filter((need) => !checkedIds.has(need.id))
    .map((need) => ({ ...need, checked: false, purchasedQuantity: 0, purchasedAt: null }));
  return [...pending, ...preserved].sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
}

export function buildGroceryNeeds(
  week: PlanningDay[],
  recipes: Recipe[],
  inventory: InventoryItem[] = [],
  now = new Date(),
  recurringProfiles: RecurringConsumptionProfile[] = RECURRING_PROFILES,
): GroceryNeed[] {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const requirements = new Map<string, GroceryNeed & { required: number }>();

  const addRequirement = (ingredient: { itemId: string; name: string; quantity: number; unit: string; store: 'king_soopers' | 'costco' }, scale: number, source: string) => {
    const id = `${ingredient.store}:${ingredient.itemId}:${ingredient.unit}`;
    const existing = requirements.get(id);
    const required = rounded(ingredient.quantity * scale);
    if (existing) {
      existing.required = rounded(existing.required + required);
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      requirements.set(id, {
        id, itemId: ingredient.itemId, name: ingredient.name, quantity: required, required,
        unit: ingredient.unit, store: storeNames[ingredient.store], inventoryUsed: 0, sources: [source],
      });
    }
  };

  for (const day of week) {
    for (const planned of [day.lunch, day.meal]) {
      if (!planned.recipeId || planned.servings <= 0) continue;
      const recipe = recipesById.get(planned.recipeId);
      if (!recipe) continue;
      const scale = planned.servings / recipe.servings;
      for (const ingredient of recipe.ingredients) {
        addRequirement(ingredient, scale, recipe.name);
      }
    }
  }

  for (const profile of recurringProfiles) {
    const occurrences = recurringProfileOccurrences(profile, week);
    for (const ingredient of profile.ingredients) addRequirement(ingredient, occurrences, profile.name);
  }

  const inventoryRemaining = new Map(
    inventory.map((item) => [`${item.itemId}:${item.unit}`, effectiveInventoryQuantity(item, now)]),
  );
  return [...requirements.values()]
    .map((need) => {
      const inventoryKey = `${need.itemId}:${need.unit}`;
      const available = inventoryRemaining.get(inventoryKey) || 0;
      const inventoryUsed = Math.min(need.required, available);
      inventoryRemaining.set(inventoryKey, rounded(available - inventoryUsed));
      return {
        id: need.id,
        itemId: need.itemId,
        name: need.name,
        quantity: rounded(need.required - inventoryUsed),
        unit: need.unit,
        store: need.store,
        inventoryUsed: rounded(inventoryUsed),
        sources: need.sources,
      };
    })
    .filter((need) => need.quantity > 0)
    .sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
}

export function formatGroceryQuantity(quantity: number, unit: string) {
  const display = Number.isInteger(quantity) ? String(quantity) : String(rounded(quantity));
  const pluralUnit = quantity !== 1 && ['can', 'each', 'slice'].includes(unit) ? `${unit}s` : unit;
  return `${display} ${pluralUnit}`;
}
