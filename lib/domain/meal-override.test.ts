import { describe, expect, it } from 'vitest';
import { STARTER_RECIPES } from './recipe';
import { buildPlanningWeek } from './schedule';
import { applyMealOverrides } from './meal-override';

const friday = new Date('2026-08-28T18:00:00Z');

describe('meal overrides', () => {
  it('replaces only the selected night with leftovers', () => {
    const week = buildPlanningWeek([], friday);
    const adjusted = applyMealOverrides(week, [{ id: 'x', date: week[0].date, kind: 'leftovers', recipeId: null, servings: 2 }], STARTER_RECIPES);
    expect(adjusted[0].meal).toMatchObject({ title: 'Leftovers', recipeId: null, servings: 2 });
    expect(adjusted[1].meal).toEqual(week[1].meal);
  });

  it('changes lunch independently without replacing dinner', () => {
    const week = buildPlanningWeek([], friday);
    const lunch = STARTER_RECIPES.find((recipe) => recipe.id === 'tuna-cucumber-toast')!;
    const adjusted = applyMealOverrides(week, [{ id: `${week[0].date}--lunch`, date: week[0].date, mealType: 'lunch', kind: 'recipe', recipeId: lunch.id, servings: 1 }], STARTER_RECIPES);
    expect(adjusted[0].lunch).toMatchObject({ title: lunch.name, recipeId: lunch.id, servings: 1 });
    expect(adjusted[0].meal).toEqual(week[0].meal);
  });
});
