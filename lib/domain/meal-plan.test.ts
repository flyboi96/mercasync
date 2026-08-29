import { describe, expect, it } from 'vitest';
import { buildPlanningWeek } from './schedule';
import { mealPlanFingerprint } from './meal-plan';

const friday = new Date('2026-08-28T18:00:00Z');

describe('shared meal plan state', () => {
  it('is stable when the visible plan has not changed', () => {
    expect(mealPlanFingerprint(buildPlanningWeek([], friday))).toBe(
      mealPlanFingerprint(buildPlanningWeek([], friday)),
    );
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
