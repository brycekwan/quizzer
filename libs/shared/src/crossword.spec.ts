import { describe, expect, it } from 'vitest';
import {
  crosswordRankBonus,
  crosswordScore,
  crosswordWordPoints,
} from './crossword';

describe('crossword scoring', () => {
  it('awards 100 points per correct word', () => {
    expect(crosswordWordPoints(0)).toBe(0);
    expect(crosswordWordPoints(3)).toBe(300);
  });

  it('awards placement bonuses from 1000 down to 100 for ranks 1–10', () => {
    expect(crosswordRankBonus(1)).toBe(1000);
    expect(crosswordRankBonus(2)).toBe(900);
    expect(crosswordRankBonus(10)).toBe(100);
    expect(crosswordRankBonus(11)).toBe(0);
    expect(crosswordRankBonus(0)).toBe(0);
  });

  it('combines word points and rank bonus', () => {
    expect(crosswordScore(2, 1)).toBe(200 + 1000);
    expect(crosswordScore(0, 3)).toBe(800);
  });
});
