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
});
