import type { InventoryItem } from './inventory';
import { effectiveInventoryQuantity } from './inventory';
import type { MealCompletion } from './meal-reconciliation';
import type { Recipe } from './recipe';
import type { PlanningDay } from './schedule';

function pantryCoverage(recipe: Recipe, inventory: InventoryItem[], now: Date) {
  if (!recipe.ingredients.length) return 0;
  const stocked = recipe.ingredients.filter((ingredient) => inventory.some((item) =>
    item.itemId === ingredient.itemId && item.unit === ingredient.unit && effectiveInventoryQuantity(item, now) > 0,
  )).length;
  return stocked / recipe.ingredients.length;
}

export function generateSmartPlan(
  schedule: PlanningDay[],
  recipes: Recipe[],
  inventory: InventoryItem[],
  history: MealCompletion[],
  now = new Date(),
) {
  const dinners = recipes.filter((recipe) => recipe.mealType === 'dinner');
  if (!dinners.length) return schedule;
  const weekStart = schedule[0]?.date || '';
  const recentlyCooked = new Set(history.filter((meal) => meal.status === 'cooked' && meal.date < weekStart).map((meal) => meal.recipeId));
  const cuisines = new Set<string>();
  const proteins = new Set<string>();
  const methods = new Set<string>();
  const used = new Set<string>();

  return schedule.map((day) => {
    if (!day.meal.recipeId || day.meal.servings === 0) return day;
    const ranked = dinners.map((recipe) => {
      let score = recipe.rating * 10 + (recipe.favorite ? 7 : 0) + pantryCoverage(recipe, inventory, now) * 14;
      if (day.alex.isLate || day.nathalia.isLate) score += recipe.lateNightSuitable ? 14 : -20;
      if (!cuisines.has(recipe.cuisine)) score += 5;
      if (!proteins.has(recipe.protein)) score += 5;
      if (!methods.has(recipe.method)) score += 3;
      if (recentlyCooked.has(recipe.id)) score -= 15;
      if (used.has(recipe.id)) score -= 100;
      return { recipe, score };
    }).sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name));
    const recipe = ranked[0].recipe;
    used.add(recipe.id); cuisines.add(recipe.cuisine); proteins.add(recipe.protein); methods.add(recipe.method);
    const reasons = [recipe.favorite ? 'household favorite' : `${recipe.rating}-star recipe`];
    if (pantryCoverage(recipe, inventory, now) >= 0.4) reasons.push('uses food on hand');
    if ((day.alex.isLate || day.nathalia.isLate) && recipe.lateNightSuitable) reasons.push('fits a late night');
    if (cuisines.size > 1) reasons.push('adds variety');
    return {
      ...day,
      meal: {
        ...day.meal,
        recipeId: recipe.id,
        title: recipe.name,
        tone: recipe.color,
        effort: recipe.effortMinutes <= 20 ? 'Quick' as const : recipe.effortMinutes >= 35 ? 'Relaxed' as const : 'Standard' as const,
        rationale: `Chosen because it is a ${reasons.join(', ')}.`,
      },
    };
  });
}
