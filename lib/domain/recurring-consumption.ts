import type { PersonId, PlanningDay } from './schedule';

export type RecurringIngredient = {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  store: 'king_soopers' | 'costco';
};

export type RecurringConsumptionProfile = {
  id: string;
  personId: PersonId;
  name: string;
  condition: 'home';
  enabled?: boolean;
  ingredients: RecurringIngredient[];
};

export const RECURRING_PROFILES: RecurringConsumptionProfile[] = [
  {
    id: 'alex-home-breakfast', personId: 'alex', name: 'Alex home breakfast', condition: 'home',
    ingredients: [
      { itemId: 'eggs', name: 'Eggs', quantity: 2, unit: 'each', store: 'costco' },
      { itemId: 'rolled-oats', name: 'Rolled oats', quantity: 0.5, unit: 'cup', store: 'costco' },
      { itemId: 'frozen-berries', name: 'Frozen berries', quantity: 0.5, unit: 'cup', store: 'costco' },
      { itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 0.75, unit: 'cup', store: 'costco' },
    ],
  },
  {
    id: 'nathalia-home-snacks', personId: 'nathalia', name: 'Nathalia snacks', condition: 'home',
    ingredients: [
      { itemId: 'apples', name: 'Apples', quantity: 1, unit: 'each', store: 'king_soopers' },
      { itemId: 'cheese', name: 'Cheese', quantity: 1, unit: 'oz', store: 'costco' },
      { itemId: 'almonds', name: 'Almonds', quantity: 1, unit: 'oz', store: 'costco' },
    ],
  },
];

export function recurringProfileOccurrences(profile: RecurringConsumptionProfile, week: PlanningDay[]) {
  if (profile.enabled === false) return 0;
  return week.filter((day) => day[profile.personId].isHome).length;
}
