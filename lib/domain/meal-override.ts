import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';

export type DinnerOverrideKind = 'recipe' | 'leftovers' | 'eat_out' | 'skip';
export type MealOverride = { id: string; date: string; mealType?: 'lunch' | 'dinner'; kind: DinnerOverrideKind; recipeId: string | null; servings: number | null };

export function applyMealOverrides(week: PlanningDay[], overrides: MealOverride[], recipes: Recipe[]) {
  const bySlot = new Map(overrides.map((override) => [`${override.date}:${override.mealType || 'dinner'}`, override]));
  return week.map((day) => {
    let next = day;
    const lunchOverride = bySlot.get(`${day.date}:lunch`);
    if (lunchOverride) {
      const recipe = recipes.find((item) => item.id === lunchOverride.recipeId && item.mealType === 'lunch');
      const servings = lunchOverride.servings ?? day.lunch.servings;
      next = { ...next, lunch: lunchOverride.kind === 'recipe' && recipe ? { recipeId: recipe.id, title: recipe.name, servings, effort: recipe.effortMinutes <= 5 ? '5 min' : '10 min', rationale: 'Manually chosen lunch.' } : { ...day.lunch, recipeId: null, title: lunchOverride.kind === 'leftovers' ? 'Leftovers' : lunchOverride.kind === 'eat_out' ? 'Lunch out' : 'Lunch off', servings: lunchOverride.kind === 'skip' ? 0 : servings, rationale: 'Manually changed lunch.' } };
    }
    const override = bySlot.get(`${day.date}:dinner`);
    if (!override) return next;
    const servings = override.servings ?? day.meal.servings;
    if (override.kind === 'skip') return { ...next, meal: { ...day.meal, recipeId: null, title: 'No dinner', tone: 'ink', servings: 0, effort: 'None' as const, label: 'NO DINNER' as const, rationale: 'Manually skipped for this night.' } };
    if (override.kind === 'eat_out') return { ...next, meal: { ...day.meal, recipeId: null, title: 'Eating out', tone: 'ink', servings, effort: 'None' as const, label: 'OUT' as const, rationale: 'Manually set to eating out.' } };
    if (override.kind === 'leftovers') return { ...next, meal: { ...day.meal, recipeId: null, title: 'Leftovers', tone: 'clay', servings, effort: 'Quick' as const, label: 'DINNER' as const, rationale: 'Manually set to leftovers.' } };
    const recipe = recipes.find((item) => item.id === override.recipeId);
    if (!recipe) return next;
    return { ...next, meal: { ...day.meal, recipeId: recipe.id, title: recipe.name, tone: recipe.color, servings, effort: recipe.effortMinutes <= 20 ? 'Quick' as const : recipe.effortMinutes >= 35 ? 'Relaxed' as const : 'Standard' as const, label: 'DINNER' as const, rationale: 'Manually chosen for this night.' } };
  });
}
