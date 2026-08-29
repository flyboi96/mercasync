import type { PlanningDay } from './schedule';
import type { Recipe } from './recipe';

export type SavedMealPlanDay = Pick<PlanningDay, 'date' | 'alex' | 'nathalia' | 'lunch' | 'meal'>;

export function mealPlanDays(week: PlanningDay[]): SavedMealPlanDay[] {
  return week.map(({ date, alex, nathalia, lunch, meal }) => ({ date, alex, nathalia, lunch, meal }));
}

export function mealPlanFingerprint(week: PlanningDay[]) {
  return JSON.stringify(mealPlanDays(week));
}

export function planningInputFingerprint(schedule: PlanningDay[], recipes: Recipe[], overrides: unknown[] = []) {
  return JSON.stringify({
    schedule: schedule.map((day) => ({ date: day.date, alex: day.alex, nathalia: day.nathalia, dinnerSelected: Boolean(day.meal.recipeId) })),
    recipes: recipes.filter((recipe) => recipe.mealType === 'dinner').map((recipe) => ({ id: recipe.id, favorite: recipe.favorite, rating: recipe.rating })),
    overrides,
  });
}
