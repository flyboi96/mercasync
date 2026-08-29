import { describe, expect, it } from 'vitest';
import {
  buildPlanningWeek,
  localDateForTimeZone,
  planningWeekLabel,
  planningWeekStart,
  type ScheduleException,
} from './schedule';

const friday = new Date('2026-08-28T18:00:00Z');

function exception(
  overrides: Partial<ScheduleException> & Pick<ScheduleException, 'personId' | 'kind' | 'date'>,
): ScheduleException {
  return {
    id: `${overrides.personId}-${overrides.kind}-${overrides.date}`,
    title: overrides.kind,
    ...overrides,
  };
}

describe('schedule planning dates', () => {
  it('uses Denver local dates and the upcoming Monday planning week', () => {
    expect(localDateForTimeZone(friday)).toBe('2026-08-28');
    expect(planningWeekStart('2026-08-28')).toBe('2026-08-31');
    const week = buildPlanningWeek([], friday);
    expect(week.map((day) => day.date)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(planningWeekLabel(week)).toBe('Aug 31 – Sep 6');
  });
});

describe('schedule-to-dinner rules', () => {
  it('assumes both people are home on normal days', () => {
    const monday = buildPlanningWeek([], friday)[0];
    expect(monday.alex.label).toBe('Home');
    expect(monday.nathalia.label).toBe('Home');
    expect(monday.meal).toMatchObject({ servings: 2, effort: 'Standard' });
  });

  it('reduces a solo dinner to one quick serving', () => {
    const monday = buildPlanningWeek(
      [exception({ personId: 'nathalia', kind: 'work_trip', date: '2026-08-31' })],
      friday,
    )[0];
    expect(monday.nathalia.label).toBe('Work trip');
    expect(monday.meal).toMatchObject({ servings: 1, effort: 'Quick' });
    expect(monday.meal.rationale).toContain('Alex');
  });

  it('keeps two servings but lowers effort for a late shift', () => {
    const monday = buildPlanningWeek(
      [exception({ personId: 'alex', kind: 'late_shift', date: '2026-08-31' })],
      friday,
    )[0];
    expect(monday.meal).toMatchObject({ servings: 2, effort: 'Quick' });
    expect(monday.meal.rationale).toContain('late shift');
  });

  it('turns dinner off when both people are away', () => {
    const monday = buildPlanningWeek(
      [
        exception({ personId: 'alex', kind: 'away', date: '2026-08-31' }),
        exception({ personId: 'nathalia', kind: 'work_trip', date: '2026-08-31' }),
      ],
      friday,
    )[0];
    expect(monday.meal).toMatchObject({
      title: 'Dinner off',
      servings: 0,
      effort: 'None',
      label: 'NO DINNER',
    });
  });

  it('lets the most recently created exception override an earlier one', () => {
    const monday = buildPlanningWeek(
      [
        exception({
          id: 'away-first',
          personId: 'alex',
          kind: 'away',
          date: '2026-08-31',
          createdAt: 1,
        }),
        exception({
          id: 'home-later',
          personId: 'alex',
          kind: 'home',
          date: '2026-08-31',
          createdAt: 2,
        }),
      ],
      friday,
    )[0];
    expect(monday.alex.label).toBe('Home');
    expect(monday.meal.servings).toBe(2);
  });
});
