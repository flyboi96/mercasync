import { describe, expect, it } from 'vitest';
import { buildGroceryNeeds, formatGroceryQuantity } from './grocery';
import { STARTER_RECIPES } from './recipe';
import { buildPlanningWeek, type ScheduleException } from './schedule';

const friday = new Date('2026-08-28T18:00:00Z');

describe('deterministic grocery calculation', () => {
  it('aggregates recipe ingredients for planned lunch and dinner servings', () => {
    const needs = buildGroceryNeeds(buildPlanningWeek([], friday), STARTER_RECIPES);
    const cucumber = needs.find((need) => need.itemId === 'cucumber');
    expect(cucumber?.quantity).toBe(10);
    expect(cucumber?.sources).toContain('Miso salmon bowls');
    expect(cucumber?.sources).toContain('Turkey hummus wrap');
  });

  it('reduces quantities when a schedule exception leaves one person home', () => {
    const trip: ScheduleException = { id: 'trip', personId: 'nathalia', kind: 'work_trip', date: '2026-08-31', title: 'Work trip' };
    const normal = buildGroceryNeeds(buildPlanningWeek([], friday), STARTER_RECIPES);
    const adjusted = buildGroceryNeeds(buildPlanningWeek([trip], friday), STARTER_RECIPES);
    expect(adjusted.find((need) => need.itemId === 'salmon')?.quantity).toBe(0.5);
    expect(normal.find((need) => need.itemId === 'salmon')?.quantity).toBe(1);
  });

  it('subtracts compatible inventory estimates and removes fully covered needs', () => {
    const needs = buildGroceryNeeds(buildPlanningWeek([], friday), STARTER_RECIPES, [
      { itemId: 'frozen-berries', quantity: 3, unit: 'cup' },
      { itemId: 'greek-yogurt', quantity: 1, unit: 'cup' },
    ]);
    expect(needs.some((need) => need.itemId === 'frozen-berries')).toBe(false);
    expect(needs.find((need) => need.itemId === 'greek-yogurt')).toMatchObject({ quantity: 3.75, inventoryUsed: 1 });
  });

  it('formats common shopping units clearly', () => {
    expect(formatGroceryQuantity(2, 'can')).toBe('2 cans');
    expect(formatGroceryQuantity(0.75, 'lb')).toBe('0.75 lb');
  });
});
