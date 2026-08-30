import type { MealTypeKey } from './meal-reconciliation';
import type { PersonId, PlanningDay } from './schedule';
import type { Recipe } from './recipe';

export type WeeklyMealDraftSlot = {
  date: string;
  mealType: MealTypeKey;
  recipeId: string | null;
  title: string;
  servings: number;
  kind: 'recipe' | 'leftovers' | 'eat_out' | 'skip';
  rationale: string;
  locked?: boolean;
};

export type AiWeeklyDraft = {
  weekStart: string;
  headline: string;
  summary: string;
  slots: WeeklyMealDraftSlot[];
  recipes?: Recipe[];
  warnings: string[];
  status: 'proposed' | 'applied' | 'dismissed';
  model?: string;
};

export type RoutinePerson = PersonId | 'both';
export type RoutineMeal = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'grocery';

export function weeklyDraftIsComplete(draft: AiWeeklyDraft) {
  const keys = new Set(draft.slots.map((slot) => `${slot.date}--${slot.mealType}`));
  return Array.from({ length: 7 }, (_, day) => day)
    .every((day) => ['lunch', 'dinner'].every((meal) => keys.has(`${addDays(draft.weekStart, day)}--${meal}`)));
}

export function applyWeeklyDraft(week: PlanningDay[], draft: AiWeeklyDraft): PlanningDay[] {
  const slots = new Map(draft.slots.map((slot) => [`${slot.date}--${slot.mealType}`, slot]));
  return week.map((day) => {
    const lunch = slots.get(`${day.date}--lunch`);
    const dinner = slots.get(`${day.date}--dinner`);
    return {
      ...day,
      lunch: lunch ? { recipeId: lunch.recipeId, title: lunch.title, servings: lunch.servings, effort: '5 min' as const, rationale: lunch.rationale } : day.lunch,
      meal: dinner ? {
        recipeId: dinner.recipeId, title: dinner.title, servings: dinner.servings,
        effort: dinner.kind === 'recipe' ? day.meal.effort : dinner.kind === 'skip' ? 'None' : 'Quick',
        tone: dinner.kind === 'recipe' ? day.meal.tone : 'clay',
        label: dinner.kind === 'eat_out' ? 'OUT' : dinner.kind === 'skip' ? 'NO DINNER' : 'DINNER',
        rationale: dinner.rationale,
      } : day.meal,
    };
  });
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
