import { describe, expect, it } from 'vitest';
import { recurringFoodOccurrences, recurringFoodOccurrencesForWeek, type RecurringFood } from './recurring-consumption';

const routine: RecurringFood = { id: 'breakfast', name: 'Breakfast', kind: 'item', timesPerWeek: 7 };

describe('recurring consumption', () => {
  it('uses the household weekly frequency', () => {
    expect(recurringFoodOccurrences({ ...routine, timesPerWeek: 4 })).toBe(4);
  });

  it('caps frequency at three times per day', () => {
    expect(recurringFoodOccurrences({ ...routine, timesPerWeek: 30 })).toBe(21);
  });

  it('does not consume a routine that the household paused', () => {
    expect(recurringFoodOccurrences({ ...routine, enabled: false })).toBe(0);
  });

  it('removes a weekday routine when its person is away', () => {
    const week = Array.from({ length: 7 }, (_, index) => ({ alex: { isHome: index !== 2 }, nathalia: { isHome: true } }));
    expect(recurringFoodOccurrencesForWeek({ ...routine, person: 'alex', mealType: 'lunch', weekdays: [0, 1, 2, 3, 4], onlyWhenHome: true, timesPerWeek: 5 }, week)).toBe(4);
  });
});
