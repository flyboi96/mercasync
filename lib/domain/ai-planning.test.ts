import { describe, expect, it } from 'vitest';
import { seasonForMonth } from './ai-planning';

describe('AI planning context', () => {
  it('maps Colorado planning months to a season', () => {
    expect(seasonForMonth(0)).toBe('winter');
    expect(seasonForMonth(3)).toBe('spring');
    expect(seasonForMonth(6)).toBe('summer');
    expect(seasonForMonth(9)).toBe('fall');
  });
});
