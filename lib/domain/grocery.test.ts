import { describe, expect, it } from 'vitest';
import { buildGroceryNeeds, formatGroceryQuantity, mergeGroceryRunItems, type GroceryNeed } from './grocery';
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

  it('reduces recurring breakfast needs while Alex is away', () => {
    const trip: ScheduleException = { id: 'trip', personId: 'alex', kind: 'work_trip', date: '2026-08-31', title: 'Work trip' };
    const normal = buildGroceryNeeds(buildPlanningWeek([], friday), STARTER_RECIPES);
    const adjusted = buildGroceryNeeds(buildPlanningWeek([trip], friday), STARTER_RECIPES);
    expect(normal.find((need) => need.itemId === 'eggs')?.quantity).toBe(14);
    expect(adjusted.find((need) => need.itemId === 'eggs')?.quantity).toBe(12);
  });

  it('subtracts compatible inventory estimates and removes fully covered needs', () => {
    const needs = buildGroceryNeeds(buildPlanningWeek([], friday), STARTER_RECIPES, [
      { itemId: 'frozen-berries', name: 'Frozen berries', quantity: 6.5, unit: 'cup', confidence: 100, lastConfirmedAt: null },
      { itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 1, unit: 'cup', confidence: 100, lastConfirmedAt: null },
    ], friday);
    expect(needs.some((need) => need.itemId === 'frozen-berries')).toBe(false);
    expect(needs.find((need) => need.itemId === 'greek-yogurt')).toMatchObject({ quantity: 9, inventoryUsed: 1 });
  });

  it('discounts uncertain inventory instead of treating every estimate as exact', () => {
    const needs = buildGroceryNeeds(buildPlanningWeek([], friday), STARTER_RECIPES, [
      { itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 2, unit: 'cup', confidence: 50, lastConfirmedAt: null },
    ], friday);
    expect(needs.find((need) => need.itemId === 'greek-yogurt')).toMatchObject({ quantity: 9, inventoryUsed: 1 });
  });

  it('formats common shopping units clearly', () => {
    expect(formatGroceryQuantity(2, 'can')).toBe('2 cans');
    expect(formatGroceryQuantity(0.75, 'lb')).toBe('0.75 lb');
  });

  it('preserves completed purchases while refreshing pending calculations', () => {
    const need: GroceryNeed = { id: 'store:yogurt:cup', itemId: 'yogurt', name: 'Yogurt', quantity: 2, unit: 'cup', store: 'Costco', inventoryUsed: 0, sources: ['Lunch'] };
    const merged = mergeGroceryRunItems([{ ...need, quantity: 3 }], [{ ...need, checked: true, purchasedQuantity: 2, purchasedAt: '2026-08-29T00:00:00.000Z' }]);
    expect(merged).toEqual([{ ...need, checked: true, purchasedQuantity: 2, purchasedAt: '2026-08-29T00:00:00.000Z' }]);
  });
});
