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

  it('converts deductions into the compatible inventory unit', () => {
    const day = buildPlanningWeek([], friday)[0];
    const deductions = mealDeductions(day, 'dinner', STARTER_RECIPES, [{ itemId: 'salmon', name: 'Salmon', quantity: 16, unit: 'oz', confidence: 100, lastConfirmedAt: null }]);
    expect(deductions.find((item) => item.itemId === 'salmon')).toMatchObject({ quantity: 16, unit: 'oz' });
  });
});
