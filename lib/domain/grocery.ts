import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';
import { effectiveInventoryQuantity, type InventoryItem } from './inventory';
import { RECURRING_FOODS, recurringFoodOccurrencesForWeek, type RecurringFood } from './recurring-consumption';
import { canonicalItemId, convertItemQuantity, normalizeUnit, unitDimension } from './units';

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
  section?: string;
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
  recurringFoods: RecurringFood[] = RECURRING_FOODS,
): GroceryNeed[] {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const requirements = new Map<string, GroceryNeed & { required: number }>();

  const addRequirement = (ingredient: { itemId: string; name: string; quantity: number; unit: string; store: 'king_soopers' | 'costco' }, scale: number, source: string) => {
    const itemId = canonicalItemId(ingredient.itemId || ingredient.name);
    const unit = normalizeUnit(ingredient.unit);
    const defaultId = `${itemId}:${unitDimension(unit)}:${unitDimension(unit) === 'unknown' ? unit : ''}`;
    const compatible = [...requirements.entries()].find(([, need]) => need.itemId === itemId && convertItemQuantity(itemId, 1, unit, need.unit) != null);
    const id = compatible?.[0] || defaultId;
    const existing = compatible?.[1];
    const required = rounded(ingredient.quantity * scale);
    if (existing) {
      const converted = convertItemQuantity(itemId, required, unit, existing.unit);
      if (converted == null) return;
      existing.required = rounded(existing.required + converted);
      if (ingredient.store === 'costco') existing.store = 'Costco';
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      requirements.set(id, {
        id, itemId, name: ingredient.name, quantity: required, required,
        unit, store: storeNames[ingredient.store], inventoryUsed: 0, sources: [source],
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

  for (const food of recurringFoods) {
    const occurrences = recurringFoodOccurrencesForWeek(food, week);
    if (food.kind === 'item' && food.ingredient) addRequirement(food.ingredient, occurrences, food.name);
    if (food.kind === 'recipe' && food.recipeId) {
      const recipe = recipesById.get(food.recipeId);
      if (!recipe) continue;
      const scale = occurrences * Math.max(1, food.servings || recipe.servings) / recipe.servings;
      for (const ingredient of recipe.ingredients) addRequirement(ingredient, scale, `${food.name} · recurring`);
    }
  }

  const inventoryRemaining = inventory.map((item) => ({ item, quantity: effectiveInventoryQuantity(item, now) }));
  return [...requirements.values()]
    .map((need) => {
      const match = inventoryRemaining.find(({ item }) => canonicalItemId(item.itemId) === need.itemId && convertItemQuantity(need.itemId, 1, item.unit, need.unit) != null);
      const available = match ? convertItemQuantity(need.itemId, match.quantity, match.item.unit, need.unit) || 0 : 0;
      const inventoryUsed = Math.min(need.required, available);
      if (match) match.quantity = convertItemQuantity(need.itemId, rounded(available - inventoryUsed), need.unit, match.item.unit) || 0;
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
