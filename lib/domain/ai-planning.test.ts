import { describe, expect, it } from 'vitest';
import { buildLocalPlanningSignals, seasonForMonth } from './ai-planning';

describe('AI planning context', () => {
  it('maps Colorado planning months to a season', () => {
    expect(seasonForMonth(0)).toBe('winter');
    expect(seasonForMonth(3)).toBe('spring');
    expect(seasonForMonth(6)).toBe('summer');
    expect(seasonForMonth(9)).toBe('fall');
  });

  it('surfaces only decisions that need household attention', () => {
    const signals = buildLocalPlanningSignals({ lateDays: 1, awayDays: 1, uncertainInventory: 2, groceryItems: 8, costcoItems: 3 });
    expect(signals.map((signal) => signal.actionTab)).toEqual(['Inventory', 'Calendar', 'Groceries']);
    expect(signals[2].detail).toContain('3 bulk-safe buys');
  });
});
