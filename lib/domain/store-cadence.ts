import type { GroceryNeed } from './grocery';

type BulkPolicy = { packageQuantity: number; shelfLifeDays: number; freezable?: boolean };

const BULK_POLICIES: Record<string, BulkPolicy> = {
  eggs: { packageQuantity: 24, shelfLifeDays: 28 },
  'rolled-oats': { packageQuantity: 10, shelfLifeDays: 180 },
  'frozen-berries': { packageQuantity: 8, shelfLifeDays: 180, freezable: true },
  'greek-yogurt': { packageQuantity: 6, shelfLifeDays: 18 },
  cheese: { packageQuantity: 24, shelfLifeDays: 35 },
  almonds: { packageQuantity: 32, shelfLifeDays: 120 },
  'chicken-breast': { packageQuantity: 6, shelfLifeDays: 120, freezable: true },
  'chicken-thighs': { packageQuantity: 6, shelfLifeDays: 120, freezable: true },
  'rotisserie-chicken': { packageQuantity: 1, shelfLifeDays: 4 },
};

export type StoreOptimizedNeed = GroceryNeed & { storeReason: string; weeksCovered: 1 | 2 };

function rounded(quantity: number) {
  return Math.round(quantity * 100) / 100;
}

export function applyStoreCadence(needs: GroceryNeed[], costcoThisWeek: boolean): StoreOptimizedNeed[] {
  return needs.map((need) => {
    const policy = BULK_POLICIES[need.itemId];
    const twoWeekDemand = rounded(need.quantity * 2);
    const packageUse = policy ? twoWeekDemand / policy.packageQuantity : 0;
    const keepsLongEnough = Boolean(policy && (policy.shelfLifeDays >= 14 || policy.freezable));
    const minimumUsefulShare = policy?.shelfLifeDays && policy.shelfLifeDays >= 60 ? 0.3 : policy?.freezable ? 0.4 : 0.55;
    const earnsBulkTrip = Boolean(costcoThisWeek && policy && keepsLongEnough && packageUse >= minimumUsefulShare);
    if (earnsBulkTrip) {
      const packages = Math.max(1, Math.ceil(twoWeekDemand / policy!.packageQuantity));
      return { ...need, id: `costco:${need.itemId}:${need.unit}`, store: 'Costco' as const, quantity: rounded(packages * policy!.packageQuantity), storeReason: `${twoWeekDemand} ${need.unit} projected for 2 weeks · bulk package keeps safely`, weeksCovered: 2 as const };
    }
    return {
      ...need,
      id: `king-soopers:${need.itemId}:${need.unit}`,
      store: 'King Soopers' as const,
      storeReason: !costcoThisWeek && policy
        ? 'Needed before the next Costco run'
        : policy && !keepsLongEnough
          ? 'Fresh item would not keep for two weeks'
          : policy
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
