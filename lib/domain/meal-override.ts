import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';

export type DinnerOverrideKind = 'recipe' | 'leftovers' | 'eat_out' | 'skip';
export type MealOverride = { id: string; date: string; kind: DinnerOverrideKind; recipeId: string | null; servings: number | null };

export function applyMealOverrides(week: PlanningDay[], overrides: MealOverride[], recipes: Recipe[]) {
  const byDate = new Map(overrides.map((override) => [override.date, override]));
  return week.map((day) => {
    const override = byDate.get(day.date);
    if (!override) return day;
    const servings = override.servings ?? day.meal.servings;
    if (override.kind === 'skip') return { ...day, meal: { ...day.meal, recipeId: null, title: 'No dinner', tone: 'ink', servings: 0, effort: 'None' as const, label: 'NO DINNER' as const, rationale: 'Manually skipped for this night.' } };
    if (override.kind === 'eat_out') return { ...day, meal: { ...day.meal, recipeId: null, title: 'Eating out', tone: 'ink', servings, effort: 'None' as const, label: 'OUT' as const, rationale: 'Manually set to eating out.' } };
    if (override.kind === 'leftovers') return { ...day, meal: { ...day.meal, recipeId: null, title: 'Leftovers', tone: 'clay', servings, effort: 'Quick' as const, label: 'DINNER' as const, rationale: 'Manually set to leftovers.' } };
    const recipe = recipes.find((item) => item.id === override.recipeId);
    if (!recipe) return day;
    return { ...day, meal: { ...day.meal, recipeId: recipe.id, title: recipe.name, tone: recipe.color, servings, effort: recipe.effortMinutes <= 20 ? 'Quick' as const : recipe.effortMinutes >= 35 ? 'Relaxed' as const : 'Standard' as const, label: 'DINNER' as const, rationale: 'Manually chosen for this night.' } };
  });
}
