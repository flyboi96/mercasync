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

  it('keeps a differently measured yogurt need exact at King Soopers', () => {
    const yogurt = { ...costcoNeed, id: 'king:greek-yogurt:cup', itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 1, unit: 'cup', store: 'King Soopers' as const };
    expect(applyStoreCadence([yogurt], true)[0]).toMatchObject({ store: 'King Soopers', storeReason: 'Costco package uses oz; keeping this cup need exact and editable' });
  });

  it('keeps fresh produce at King Soopers even when Costco was preferred', () => {
    const spinach = { ...costcoNeed, itemId: 'baby-spinach', name: 'Baby spinach', quantity: 1, unit: 'lb' };
    expect(applyStoreCadence([spinach], true)[0]).toMatchObject({ store: 'King Soopers', storeReason: 'Fresh produce is sized for this week to reduce waste' });
  });

  it('does not compare incompatible recipe units with a bulk package', () => {
    const yogurt = { ...costcoNeed, itemId: 'greek-yogurt', name: 'Greek yogurt', quantity: 2, unit: 'cup' };
    expect(applyStoreCadence([yogurt], true)[0]).toMatchObject({ store: 'King Soopers' });
  });

  it('uses Costco for a shelf-stable package that can safely last beyond two weeks', () => {
    const almonds = { ...costcoNeed, id: 'costco:almonds:oz', itemId: 'almonds', name: 'Almonds', quantity: 5, unit: 'oz' };
    expect(applyStoreCadence([almonds], true)[0]).toMatchObject({ store: 'Costco', quantity: 32 });
  });

  it('honors a remembered King Soopers preference', () => {
    const preferences = [{ id: 'eggs', itemId: 'eggs', name: 'Eggs', preferredStore: 'King Soopers' as const, bulkMode: 'never' as const, packageQuantity: null, packageUnit: null, shelfLifeDays: null, freezable: false }];
    expect(applyStoreCadence([costcoNeed], true, preferences)[0]).toMatchObject({ store: 'King Soopers', storeReason: 'Remembered household preference: buy this at King Soopers' });
  });

  it('uses a remembered compatible Costco package policy', () => {
    const need = { ...costcoNeed, itemId: 'tofu', name: 'Tofu', quantity: 2, unit: 'each', store: 'King Soopers' as const };
    const preferences = [{ id: 'tofu', itemId: 'tofu', name: 'Tofu', preferredStore: 'Costco' as const, bulkMode: 'always' as const, packageQuantity: 4, packageUnit: 'each', shelfLifeDays: 30, freezable: false }];
    expect(applyStoreCadence([need], true, preferences)[0]).toMatchObject({ store: 'Costco', quantity: 4 });
  });
});
