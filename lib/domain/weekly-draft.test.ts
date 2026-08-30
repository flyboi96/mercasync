import { describe, expect, it } from 'vitest';
import { applyWeeklyDraft, weeklyDraftIsComplete, type AiWeeklyDraft } from './weekly-draft';
import { buildPlanningWeek } from './schedule';

describe('weekly AI draft', () => {
  const base: AiWeeklyDraft = { weekStart: '2026-08-31', headline: 'A flavorful week', summary: 'Fast where needed.', warnings: [], status: 'proposed', slots: [] };
  it('requires lunch and dinner for all seven days', () => {
    expect(weeklyDraftIsComplete(base)).toBe(false);
    const slots = Array.from({ length: 7 }, (_, index) => ['lunch', 'dinner'].map((mealType) => ({ date: `2026-0${index === 0 ? '8-31' : `9-0${index}`}`, mealType, recipeId: null, title: 'Leftovers', servings: 2, kind: 'leftovers', rationale: 'Easy.' }))).flat() as AiWeeklyDraft['slots'];
    expect(weeklyDraftIsComplete({ ...base, slots })).toBe(true);
  });
  it('applies proposed slots without changing availability', () => {
    const week = buildPlanningWeek([], new Date('2026-08-30T12:00:00Z'));
    const next = applyWeeklyDraft(week, { ...base, slots: [{ date: '2026-08-31', mealType: 'dinner', recipeId: null, title: 'Eat out', servings: 2, kind: 'eat_out', rationale: 'Fun night.' }] });
    expect(next[0].meal.title).toBe('Eat out');
    expect(next[0].meal.label).toBe('OUT');
    expect(next[0].alex).toEqual(week[0].alex);
  });
});
