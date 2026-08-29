import type { PlanningDay } from './schedule';

export type SavedMealPlanDay = Pick<PlanningDay, 'date' | 'alex' | 'nathalia' | 'meal'>;

export function mealPlanDays(week: PlanningDay[]): SavedMealPlanDay[] {
  return week.map(({ date, alex, nathalia, meal }) => ({ date, alex, nathalia, meal }));
}

export function mealPlanFingerprint(week: PlanningDay[]) {
  return JSON.stringify(mealPlanDays(week));
}
