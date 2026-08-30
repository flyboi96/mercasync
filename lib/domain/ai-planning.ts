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

export type AiPlanningRecommendation = {
  category: 'schedule' | 'inventory' | 'shopping' | 'prep' | 'nutrition';
  title: string;
  rationale: string;
  actionTab: 'Calendar' | 'Recipes' | 'Inventory' | 'Groceries';
};

export type AiPlanningBrief = {
  weekStart: string;
  headline: string;
  summary: string;
  recommendations: AiPlanningRecommendation[];
  model?: string;
  createdAt?: unknown;
};

export type AiGenerationRequest = {
  id: string;
  weekStart: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt?: { toMillis?: () => number } | null;
  completedAt?: unknown;
  errorMessage?: string;
};

export type LocalPlanningSignal = {
  id: string;
  label: string;
  detail: string;
  actionTab: 'Calendar' | 'Inventory' | 'Groceries';
  tone: 'coral' | 'saffron' | 'green';
};

export function buildLocalPlanningSignals(input: {
  lateDays: number;
  awayDays: number;
  uncertainInventory: number;
  groceryItems: number;
  costcoItems: number;
}): LocalPlanningSignal[] {
  const signals: LocalPlanningSignal[] = [];
  if (input.uncertainInventory > 0) signals.push({ id: 'inventory', label: `${input.uncertainInventory} pantry ${input.uncertainInventory === 1 ? 'check' : 'checks'}`, detail: 'Confirm these before shopping to prevent duplicate purchases.', actionTab: 'Inventory', tone: 'saffron' });
  if (input.lateDays + input.awayDays > 0) signals.push({ id: 'schedule', label: `${input.lateDays + input.awayDays} schedule-sensitive ${input.lateDays + input.awayDays === 1 ? 'day' : 'days'}`, detail: 'Meals and servings have already adjusted around them.', actionTab: 'Calendar', tone: 'coral' });
  if (input.groceryItems > 0) signals.push({ id: 'shopping', label: `${input.groceryItems} items across ${input.costcoItems > 0 ? '2 stores' : 'King Soopers'}`, detail: input.costcoItems > 0 ? `${input.costcoItems} bulk-safe ${input.costcoItems === 1 ? 'buy' : 'buys'} routed to Costco.` : 'No bulk trip is required for this list.', actionTab: 'Groceries', tone: 'green' });
  return signals.slice(0, 3);
}

export function seasonForMonth(month: number) {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'fall';
}
