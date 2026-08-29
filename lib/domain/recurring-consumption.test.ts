import { describe, expect, it } from 'vitest';
import { RECURRING_FOODS, recurringFoodOccurrences } from './recurring-consumption';

describe('recurring consumption', () => {
  it('uses the household weekly frequency', () => {
    expect(recurringFoodOccurrences({ ...RECURRING_FOODS[0], timesPerWeek: 4 })).toBe(4);
  });

  it('caps frequency at three times per day', () => {
    expect(recurringFoodOccurrences({ ...RECURRING_FOODS[0], timesPerWeek: 30 })).toBe(21);
  });

  it('does not consume a routine that the household paused', () => {
    expect(recurringFoodOccurrences({ ...RECURRING_FOODS[0], enabled: false })).toBe(0);
  });
});
