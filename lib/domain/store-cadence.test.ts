import { describe, expect, it } from 'vitest';
import { applyStoreCadence } from './store-cadence';

const costcoNeed = { id: 'costco:eggs:each', itemId: 'eggs', name: 'Eggs', quantity: 12, unit: 'each', store: 'Costco' as const, inventoryUsed: 0, sources: ['Breakfast'] };

describe('store cadence', () => {
  it('keeps bulk needs at Costco during a Costco week', () => {
    expect(applyStoreCadence([costcoNeed], true)[0]).toMatchObject({ store: 'Costco', quantity: 24, weeksCovered: 2 });
  });

  it('routes immediate needs to King Soopers when Costco is next week', () => {
    expect(applyStoreCadence([costcoNeed], false)[0]).toMatchObject({ store: 'King Soopers', quantity: 12, storeReason: 'Needed before the next Costco run' });
  });

  it('keeps a small purchase at King Soopers even during Costco week', () => {
    const yogurt = { ...costcoNeed, id: 'king:greek-yogurt:cup', itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 1, unit: 'cup', store: 'King Soopers' as const };
    expect(applyStoreCadence([yogurt], true)[0]).toMatchObject({ store: 'King Soopers', storeReason: 'Weekly need is too small for the bulk package' });
  });

  it('uses Costco for a shelf-stable package that can safely last beyond two weeks', () => {
    const almonds = { ...costcoNeed, id: 'costco:almonds:oz', itemId: 'almonds', name: 'Almonds', quantity: 5, unit: 'oz' };
    expect(applyStoreCadence([almonds], true)[0]).toMatchObject({ store: 'Costco', quantity: 32 });
  });
});
