import { describe, expect, it } from 'vitest';
import { buildPlanningWeek } from './schedule';
import { mealPlanFingerprint, planningInputFingerprint } from './meal-plan';
import { STARTER_RECIPES } from './recipe';

const friday = new Date('2026-08-28T18:00:00Z');

describe('shared meal plan state', () => {
  it('is stable when the visible plan has not changed', () => {
    expect(mealPlanFingerprint(buildPlanningWeek([], friday))).toBe(
      mealPlanFingerprint(buildPlanningWeek([], friday)),
    );
  });

  it('invalidates approval for schedule and recipe-preference changes', () => {
    const week = buildPlanningWeek([], friday);
    const original = planningInputFingerprint(week, STARTER_RECIPES);
    const changedRating = STARTER_RECIPES.map((recipe) => recipe.id === 'lemony-chicken-orzo' ? { ...recipe, rating: 5 } : recipe);
    expect(planningInputFingerprint(week, changedRating)).not.toBe(original);
    expect(planningInputFingerprint(buildPlanningWeek([], friday, 'America/Denver', 3), STARTER_RECIPES)).not.toBe(original);
  });

  it('changes when a schedule exception changes dinner servings and effort', () => {
    const original = buildPlanningWeek([], friday);
    const adjusted = buildPlanningWeek([
      {
        id: 'trip',
        personId: 'nathalia',
        kind: 'work_trip',
        date: '2026-08-31',
        title: 'Work trip',
      },
    ], friday);

    expect(adjusted[0].meal).toMatchObject({ servings: 1, effort: 'Quick' });
    expect(mealPlanFingerprint(adjusted)).not.toBe(mealPlanFingerprint(original));
  });
});
