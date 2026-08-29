import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';

export type MealTypeKey = 'lunch' | 'dinner';
export type MealCompletionStatus = 'cooked' | 'skipped';

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

export function mealDeductions(day: PlanningDay, mealType: MealTypeKey, recipes: Recipe[]): MealDeduction[] {
  const planned = mealType === 'lunch' ? day.lunch : day.meal;
  if (!planned.recipeId || planned.servings <= 0) return [];
  const recipe = recipes.find((candidate) => candidate.id === planned.recipeId);
  if (!recipe) return [];
  const scale = planned.servings / recipe.servings;
  return recipe.ingredients.map((ingredient) => ({
    itemId: ingredient.itemId,
    name: ingredient.name,
    quantity: Math.round(ingredient.quantity * scale * 100) / 100,
    unit: ingredient.unit,
  }));
}
