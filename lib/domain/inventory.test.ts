import { describe, expect, it } from 'vitest';
import { correctedInventoryQuantity, effectiveInventoryConfidence, effectiveInventoryQuantity, inventoryDocumentId, type InventoryItem } from './inventory';

const item: InventoryItem = {
  itemId: 'greek-yogurt',
  name: 'Greek yogurt',
  quantity: 4,
  unit: 'cup',
  confidence: 90,
  lastConfirmedAt: '2026-08-20T12:00:00.000Z',
};

describe('inventory confidence', () => {
  it('decays two points per elapsed day', () => {
    expect(effectiveInventoryConfidence(item, new Date('2026-08-25T12:00:00.000Z'))).toBe(80);
  });

  it('uses confidence to estimate usable quantity', () => {
    expect(effectiveInventoryQuantity(item, new Date('2026-08-25T12:00:00.000Z'))).toBe(3.2);
  });

  it('keeps a small nonzero confidence floor', () => {
    expect(effectiveInventoryConfidence(item, new Date('2027-08-25T12:00:00.000Z'))).toBe(10);
  });

  it('creates a stable document key for item and unit', () => {
    expect(inventoryDocumentId(item)).toBe('greek-yogurt--cup');
  });

  it('turns lightweight corrections into predictable quantities', () => {
    expect(correctedInventoryQuantity(4, 'out')).toBe(0);
    expect(correctedInventoryQuantity(4, 'half')).toBe(2);
    expect(correctedInventoryQuantity(4, 'same')).toBe(4);
    expect(correctedInventoryQuantity(4, 'more')).toBe(6);
  });
});
