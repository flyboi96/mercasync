import { describe, expect, it } from 'vitest';
import { canonicalItemId, convertQuantity, normalizeUnit, unitDimension } from './units';

describe('ingredient normalization', () => {
  it('normalizes common names and unit spellings', () => {
    expect(canonicalItemId('Greek yoghurt')).toBe('greek-yogurt');
    expect(canonicalItemId('Cucumbers')).toBe('cucumber');
    expect(normalizeUnit('Tablespoons')).toBe('tbsp');
  });

  it('converts compatible mass and volume units', () => {
    expect(convertQuantity(2, 'lb', 'oz')).toBe(32);
    expect(convertQuantity(1, 'cup', 'tbsp')).toBe(16);
    expect(convertQuantity(6, 'tbsp', 'cup')).toBe(0.38);
  });

  it('refuses unsafe conversions between unrelated dimensions', () => {
    expect(unitDimension('each')).toBe('count');
    expect(convertQuantity(2, 'cup', 'oz')).toBeNull();
    expect(convertQuantity(1, 'bag', 'each')).toBeNull();
  });
});
