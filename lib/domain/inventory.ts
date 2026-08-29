export type InventoryItem = {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
  lastConfirmedAt: string | null;
};

export const STARTER_INVENTORY: InventoryItem[] = [
  { itemId: 'jasmine-rice', name: 'Jasmine rice', quantity: 10.5, unit: 'cup', confidence: 92, lastConfirmedAt: null },
  { itemId: 'eggs', name: 'Eggs', quantity: 8, unit: 'each', confidence: 78, lastConfirmedAt: null },
  { itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 1, unit: 'cup', confidence: 34, lastConfirmedAt: null },
  { itemId: 'frozen-berries', name: 'Frozen berries', quantity: 3, unit: 'cup', confidence: 66, lastConfirmedAt: null },
];

const DAILY_CONFIDENCE_DECAY = 2;
const MINIMUM_CONFIDENCE = 10;

export function inventoryDocumentId(item: Pick<InventoryItem, 'itemId' | 'unit'>) {
  return `${item.itemId}--${item.unit}`.replaceAll('/', '-');
}

export function effectiveInventoryConfidence(item: InventoryItem, now = new Date()) {
  if (!item.lastConfirmedAt) return item.confidence;
  const confirmed = new Date(item.lastConfirmedAt);
  if (Number.isNaN(confirmed.getTime())) return item.confidence;
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - confirmed.getTime()) / 86_400_000));
  return Math.max(MINIMUM_CONFIDENCE, item.confidence - elapsedDays * DAILY_CONFIDENCE_DECAY);
}

export function effectiveInventoryQuantity(item: InventoryItem, now = new Date()) {
  return Math.round(item.quantity * effectiveInventoryConfidence(item, now)) / 100;
}

