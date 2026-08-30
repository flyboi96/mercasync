import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';
import type { InventoryItem } from './inventory';
import { canonicalItemId, convertQuantity, normalizeUnit } from './units';

export type MealTypeKey = 'lunch' | 'dinner';
export type MealCompletionStatus = 'cooked' | 'leftovers' | 'eat_out' | 'skipped';

export type MealDeduction = {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
};

export type MealCompletion = {
  id: string;
  date: string;
  mealType: MealTypeKey;
  recipeId: string;
  recipeName: string;
  servings: number;
  status: MealCompletionStatus;
  deductions: MealDeduction[];
};

export function mealCompletionId(date: string, mealType: MealTypeKey) {
  return `${date}--${mealType}`;
}

export function mealDeductions(day: PlanningDay, mealType: MealTypeKey, recipes: Recipe[], inventory: InventoryItem[] = []): MealDeduction[] {
  const planned = mealType === 'lunch' ? day.lunch : day.meal;
  if (!planned.recipeId || planned.servings <= 0) return [];
  const recipe = recipes.find((candidate) => candidate.id === planned.recipeId);
  if (!recipe) return [];
  const scale = planned.servings / recipe.servings;
  return recipe.ingredients.map((ingredient) => {
    const itemId = canonicalItemId(ingredient.itemId || ingredient.name);
    const unit = normalizeUnit(ingredient.unit);
    const onHand = inventory.find((item) => canonicalItemId(item.itemId) === itemId && convertQuantity(1, unit, item.unit) != null);
    const targetUnit = onHand ? normalizeUnit(onHand.unit) : unit;
    const quantity = convertQuantity(ingredient.quantity * scale, unit, targetUnit) ?? ingredient.quantity * scale;
    return { itemId, name: ingredient.name, quantity: Math.round(quantity * 100) / 100, unit: targetUnit };
  });
}
