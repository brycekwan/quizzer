import { describe, expect, it } from 'vitest';
import {
  wordSearchRankBonus,
  wordSearchScore,
  wordSearchWordPoints,
} from './wordSearch';

describe('word search scoring', () => {
  it('awards 100 points per word found', () => {
    expect(wordSearchWordPoints(0)).toBe(0);
    expect(wordSearchWordPoints(10)).toBe(1000);
  });

  it('awards placement bonuses from 1000 down to 100 for ranks 1–10', () => {
    expect(wordSearchRankBonus(1)).toBe(1000);
    expect(wordSearchRankBonus(2)).toBe(900);
    expect(wordSearchRankBonus(10)).toBe(100);
    expect(wordSearchRankBonus(11)).toBe(0);
    expect(wordSearchRankBonus(0)).toBe(0);
  });

  it('combines word points and rank bonus', () => {
    expect(wordSearchScore(10, 1)).toBe(2000);
    expect(wordSearchScore(10, 10)).toBe(1100);
    expect(wordSearchScore(10, 11)).toBe(1000);
    expect(wordSearchScore(2, 3)).toBe(200 + 800);
  });
});
