import type { RecipeIngredient } from './recipe';

export type RecurringFood = {
  id: string;
  name: string;
  kind: 'recipe' | 'item';
  timesPerWeek: number;
  enabled?: boolean;
  recipeId?: string | null;
  servings?: number | null;
  ingredient?: RecipeIngredient | null;
  person?: 'alex' | 'nathalia' | 'both';
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'grocery';
  weekdays?: number[];
  onlyWhenHome?: boolean;
};

export const RECURRING_FOODS: RecurringFood[] = [];
export const LEGACY_STARTER_FOOD_IDS = new Set(['eggs', 'rolled-oats', 'frozen-berries', 'greek-yogurt', 'apples', 'cheese', 'almonds']);

export function recurringFoodOccurrences(food: RecurringFood) {
  return food.enabled === false ? 0 : Math.max(0, Math.min(21, Math.round(food.timesPerWeek)));
}

export function recurringFoodOccurrencesForWeek(food: RecurringFood, week?: { alex: { isHome: boolean }; nathalia: { isHome: boolean } }[]) {
  if (!week || !food.weekdays?.length || food.onlyWhenHome === false || !food.person || food.person === 'both') return recurringFoodOccurrences(food);
  return food.weekdays.filter((weekday) => {
    const day = week[weekday];
    return day && (food.person === 'alex' ? day.alex.isHome : day.nathalia.isHome);
  }).length;
}
