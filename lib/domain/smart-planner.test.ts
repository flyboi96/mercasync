import { describe, expect, it } from 'vitest';
import { STARTER_RECIPES } from './recipe';
import { buildPlanningWeek } from './schedule';
import { generateSmartPlan } from './smart-planner';

const friday = new Date('2026-08-28T18:00:00Z');

describe('smart weekly planner', () => {
  it('chooses the requested number of distinct recipe dinners', () => {
    const plan = generateSmartPlan(buildPlanningWeek([], friday, 'America/Denver', 5), STARTER_RECIPES, [], []);
    const dinners = plan.filter((day) => day.meal.recipeId).map((day) => day.meal.recipeId);
    expect(dinners).toHaveLength(5);
    expect(new Set(dinners)).toHaveLength(5);
  });

  it('uses a late-night-suitable recipe on a late shift', () => {
    const schedule = buildPlanningWeek([{ id: 'late', personId: 'alex', kind: 'late_shift', date: '2026-08-31', title: 'Late' }], friday);
    const plan = generateSmartPlan(schedule, STARTER_RECIPES, [], []);
    expect(STARTER_RECIPES.find((recipe) => recipe.id === plan[0].meal.recipeId)?.lateNightSuitable).toBe(true);
  });

  it('penalizes a recently cooked favorite when alternatives exist', () => {
    const schedule = buildPlanningWeek([], friday, 'America/Denver', 1);
    const plan = generateSmartPlan(schedule, STARTER_RECIPES, [], [{ id: 'old', date: '2026-08-25', mealType: 'dinner', recipeId: 'harissa-turkey-pitas', recipeName: 'Harissa turkey pitas', servings: 2, status: 'cooked', deductions: [] }]);
    expect(plan.find((day) => day.meal.recipeId)?.meal.recipeId).not.toBe('harissa-turkey-pitas');
  });
});
