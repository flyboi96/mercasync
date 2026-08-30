import type { Recipe } from './recipe';

export type HouseholdFoodGoals = {
  proteinForward: boolean;
  vegetablesDaily: boolean;
  seasonalPriority: boolean;
  maxWeeknightMinutes: number;
  adventurousness: number;
  avoidIngredients: string;
  notes: string;
};

export const DEFAULT_FOOD_GOALS: HouseholdFoodGoals = {
  proteinForward: true,
  vegetablesDaily: true,
  seasonalPriority: true,
  maxWeeknightMinutes: 35,
  adventurousness: 3,
  avoidIngredients: '',
  notes: 'Strong flavor, whole foods, cuisine and texture variety.',
};

export type AiRecipeProposal = {
  id: string;
  status: 'proposed' | 'approved' | 'rejected';
  recipe: Recipe;
  whyItFits: string;
  inventoryHighlights: string[];
  seasonalHighlights: string[];
  createdAt?: unknown;
};

export function seasonForMonth(month: number) {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'fall';
}
