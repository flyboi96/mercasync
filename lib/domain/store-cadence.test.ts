import { describe, expect, it } from 'vitest';
import { applyStoreCadence } from './store-cadence';

const costcoNeed = { id: 'costco:eggs:each', itemId: 'eggs', name: 'Eggs', quantity: 12, unit: 'each', store: 'Costco' as const, inventoryUsed: 0, sources: ['Breakfast'] };

describe('store cadence', () => {
  it('keeps bulk needs at Costco during a Costco week', () => {
    expect(applyStoreCadence([costcoNeed], true)[0].store).toBe('Costco');
  });

  it('routes immediate needs to King Soopers when Costco is next week', () => {
    expect(applyStoreCadence([costcoNeed], false)[0]).toMatchObject({ store: 'King Soopers', sources: ['Breakfast', 'Costco run next week'] });
  });
});
