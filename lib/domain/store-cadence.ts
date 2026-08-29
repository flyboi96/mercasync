import type { GroceryNeed } from './grocery';

export function applyStoreCadence(needs: GroceryNeed[], costcoThisWeek: boolean) {
  if (costcoThisWeek) return needs;
  return needs.map((need) => need.store === 'Costco' ? {
    ...need,
    id: `king-soopers:${need.itemId}:${need.unit}`,
    store: 'King Soopers' as const,
    sources: [...need.sources, 'Costco run next week'],
  } : need).sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
}

export function storeRunLabel(week: { date: string; dayLabel: string }[], store: 'King Soopers' | 'Costco', costcoThisWeek: boolean) {
  if (store === 'King Soopers') return `Weekend · ${week[5]?.dayLabel || 'Sat'} ${week[5]?.date.slice(5).replace('-', '/') || ''}`;
  if (!costcoThisWeek) return 'Next week · Tue–Thu';
  return `${week[1]?.date.slice(5).replace('-', '/')}–${week[3]?.date.slice(5).replace('-', '/')} · after work`;
}
