import { describe, expect, it } from 'vitest';
import { mealCompletionId, mealDeductions } from './meal-reconciliation';
import { STARTER_RECIPES } from './recipe';
import { buildPlanningWeek } from './schedule';

const friday = new Date('2026-08-28T18:00:00Z');

describe('meal reconciliation', () => {
  it('scales ingredient deductions to planned servings', () => {
    const day = buildPlanningWeek([], friday)[0];
    expect(mealDeductions(day, 'dinner', STARTER_RECIPES).find((item) => item.itemId === 'salmon')?.quantity).toBe(1);
  });

  it('uses a stable meal completion id', () => {
    expect(mealCompletionId('2026-08-31', 'lunch')).toBe('2026-08-31--lunch');
  });
});
