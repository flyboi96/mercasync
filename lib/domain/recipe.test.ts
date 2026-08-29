import { describe, expect, it } from 'vitest';
import { STARTER_RECIPES } from './recipe';

describe('starter recipe library', () => {
  it('has unique stable IDs and complete cooking details', () => {
    expect(new Set(STARTER_RECIPES.map((recipe) => recipe.id)).size).toBe(STARTER_RECIPES.length);
    for (const recipe of STARTER_RECIPES) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.instructions.length).toBeGreaterThan(0);
      expect(recipe.servings).toBe(2);
      expect(recipe.rating).toBeGreaterThanOrEqual(0);
      expect(recipe.rating).toBeLessThanOrEqual(5);
    }
  });

  it('keeps every starter lunch extremely fast', () => {
    const lunches = STARTER_RECIPES.filter((recipe) => recipe.mealType === 'lunch');
    expect(lunches.length).toBeGreaterThanOrEqual(4);
    expect(lunches.every((recipe) => recipe.effortMinutes <= 10)).toBe(true);
  });

  it('uses normalized ingredient IDs for future grocery calculations', () => {
    for (const recipe of STARTER_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.itemId).toMatch(/^[a-z0-9-]+$/);
        expect(ingredient.quantity).toBeGreaterThan(0);
      }
    }
  });
});
