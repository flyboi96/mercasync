import { describe, expect, it } from 'vitest';
import { RECURRING_PROFILES, recurringProfileOccurrences } from './recurring-consumption';
import { buildPlanningWeek } from './schedule';

const friday = new Date('2026-08-28T18:00:00Z');

describe('recurring consumption', () => {
  it('applies a home routine on every normal day', () => {
    expect(recurringProfileOccurrences(RECURRING_PROFILES[0], buildPlanningWeek([], friday))).toBe(7);
  });

  it('skips a routine while its person is away', () => {
    const week = buildPlanningWeek([{ id: 'trip', personId: 'alex', kind: 'work_trip', date: '2026-08-31', title: 'Trip' }], friday);
    expect(recurringProfileOccurrences(RECURRING_PROFILES[0], week)).toBe(6);
  });

  it('does not consume a routine that the household paused', () => {
    expect(recurringProfileOccurrences({ ...RECURRING_PROFILES[0], enabled: false }, buildPlanningWeek([], friday))).toBe(0);
  });
});
