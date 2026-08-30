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

export const RECURRING_FOODS: RecurringFood[] = [
  { id: 'eggs', name: 'Eggs', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each', store: 'costco' } },
  { id: 'rolled-oats', name: 'Rolled oats', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'rolled-oats', name: 'Rolled oats', quantity: 0.5, unit: 'cup', store: 'costco' } },
  { id: 'frozen-berries', name: 'Frozen berries', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'frozen-berries', name: 'Frozen berries', quantity: 0.5, unit: 'cup', store: 'costco' } },
  { id: 'greek-yogurt', name: 'Greek yogurt', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 0.75, unit: 'cup', store: 'costco' } },
  { id: 'apples', name: 'Apples', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'apples', name: 'Apples', quantity: 1, unit: 'each', store: 'king_soopers' } },
  { id: 'cheese', name: 'Cheese', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'cheese', name: 'Cheese', quantity: 1, unit: 'oz', store: 'costco' } },
  { id: 'almonds', name: 'Almonds', kind: 'item', timesPerWeek: 7, enabled: true, ingredient: { itemId: 'almonds', name: 'Almonds', quantity: 1, unit: 'oz', store: 'costco' } },
];

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
