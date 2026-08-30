import type { GroceryNeed } from './grocery';
import type { StorePreference } from './store-preference';

type BulkPolicy = { packageQuantity: number; packageUnit: string; shelfLifeDays: number; freezable?: boolean };

const BULK_POLICIES: Record<string, BulkPolicy> = {
  eggs: { packageQuantity: 24, packageUnit: 'each', shelfLifeDays: 28 },
  'rolled-oats': { packageQuantity: 10, packageUnit: 'lb', shelfLifeDays: 180 },
  'frozen-berries': { packageQuantity: 4, packageUnit: 'lb', shelfLifeDays: 180, freezable: true },
  'greek-yogurt': { packageQuantity: 48, packageUnit: 'oz', shelfLifeDays: 35 },
  cheese: { packageQuantity: 24, packageUnit: 'oz', shelfLifeDays: 35 },
  almonds: { packageQuantity: 32, packageUnit: 'oz', shelfLifeDays: 120 },
  'chicken-breast': { packageQuantity: 6, packageUnit: 'lb', shelfLifeDays: 120, freezable: true },
  'chicken-thighs': { packageQuantity: 6, packageUnit: 'lb', shelfLifeDays: 120, freezable: true },
  'ground-turkey': { packageQuantity: 4, packageUnit: 'lb', shelfLifeDays: 120, freezable: true },
  'olive-oil': { packageQuantity: 2, packageUnit: 'each', shelfLifeDays: 365 },
  'rotisserie-chicken': { packageQuantity: 1, packageUnit: 'each', shelfLifeDays: 4 },
};

const PRODUCE_HINTS = ['spinach', 'lettuce', 'cucumber', 'tomato', 'avocado', 'herb', 'cilantro', 'parsley', 'pepper', 'zucchini', 'broccoli', 'asparagus', 'berry'];

function isProduce(need: GroceryNeed) {
  const value = `${need.itemId} ${need.name}`.toLowerCase();
  return PRODUCE_HINTS.some((hint) => value.includes(hint)) && !value.includes('frozen');
}

export type StoreOptimizedNeed = GroceryNeed & { storeReason: string; weeksCovered: 1 | 2 };

function rounded(quantity: number) {
  return Math.round(quantity * 100) / 100;
}

export function applyStoreCadence(needs: GroceryNeed[], costcoThisWeek: boolean, preferences: StorePreference[] = []): StoreOptimizedNeed[] {
  return needs.map((need) => {
    const preference = preferences.find((item) => item.itemId === need.itemId);
    const savedPolicy = preference?.packageQuantity && preference.packageUnit && preference.shelfLifeDays ? { packageQuantity: preference.packageQuantity, packageUnit: preference.packageUnit, shelfLifeDays: preference.shelfLifeDays, freezable: preference.freezable } : undefined;
    const policy = savedPolicy || BULK_POLICIES[need.itemId];
    if (preference?.bulkMode === 'never' || preference?.preferredStore === 'King Soopers') return { ...need, id: `king-soopers:${need.itemId}:${need.unit}`, store: 'King Soopers' as const, storeReason: 'Remembered household preference: buy this at King Soopers', weeksCovered: 1 as const };
    if (isProduce(need) && preference?.bulkMode !== 'always') return { ...need, id: `king-soopers:${need.itemId}:${need.unit}`, store: 'King Soopers' as const, storeReason: 'Fresh produce is sized for this week to reduce waste', weeksCovered: 1 as const };
    const compatiblePolicy = policy?.packageUnit === need.unit ? policy : undefined;
    const twoWeekDemand = rounded(need.quantity * 2);
    const packageUse = compatiblePolicy ? twoWeekDemand / compatiblePolicy.packageQuantity : 0;
    const keepsLongEnough = Boolean(compatiblePolicy && (compatiblePolicy.shelfLifeDays >= 14 || compatiblePolicy.freezable));
    const automaticShare = compatiblePolicy?.shelfLifeDays && compatiblePolicy.shelfLifeDays >= 60 ? 0.3 : compatiblePolicy?.freezable ? 0.4 : 0.55;
    const prefersCostco = preference?.preferredStore === 'Costco' || need.store === 'Costco';
    const minimumUsefulShare = preference?.bulkMode === 'always' ? 0 : prefersCostco ? Math.min(automaticShare, 0.2) : automaticShare;
    const earnsBulkTrip = Boolean(costcoThisWeek && compatiblePolicy && keepsLongEnough && packageUse >= minimumUsefulShare);
    if (earnsBulkTrip) {
      const packages = Math.max(1, Math.ceil(twoWeekDemand / compatiblePolicy!.packageQuantity));
      return { ...need, id: `costco:${need.itemId}:${need.unit}`, store: 'Costco' as const, quantity: rounded(packages * compatiblePolicy!.packageQuantity), storeReason: `${twoWeekDemand} ${need.unit} projected for 2 weeks · ${prefersCostco ? 'household prefers Costco and ' : ''}bulk package keeps safely`, weeksCovered: 2 as const };
    }
    return {
      ...need,
      id: `king-soopers:${need.itemId}:${need.unit}`,
      store: 'King Soopers' as const,
      storeReason: !costcoThisWeek && policy
        ? 'Needed before the next Costco run'
        : policy && !compatiblePolicy
          ? `Costco package uses ${policy.packageUnit}; keeping this ${need.unit} need exact and editable`
          : compatiblePolicy && !keepsLongEnough
          ? 'Fresh item would not keep for two weeks'
          : compatiblePolicy
            ? 'Weekly need is too small for the bulk package'
            : 'Best bought in a normal weekly quantity',
      weeksCovered: 1 as const,
    };
  }).sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
}

export function storeRunLabel(week: { date: string; dayLabel: string }[], store: 'King Soopers' | 'Costco', costcoThisWeek: boolean) {
  if (store === 'King Soopers') return `Weekend · ${week[5]?.dayLabel || 'Sat'} ${week[5]?.date.slice(5).replace('-', '/') || ''}`;
  if (!costcoThisWeek) return 'Next week · Tue–Thu';
  return `${week[1]?.date.slice(5).replace('-', '/')}–${week[3]?.date.slice(5).replace('-', '/')} · after work`;
}
