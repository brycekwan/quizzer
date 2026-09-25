import { describe, expect, it } from 'vitest';
import {
  listCrosswordPuzzles,
  loadCrosswordPuzzle,
  resolveCrosswordPuzzlesDir,
} from './loadPuzzle';

describe('loadCrosswordPuzzle', () => {
  it('loads the foods pack', () => {
    const loaded = loadCrosswordPuzzle('foods');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.puzzle.title).toBe('Foods');
    expect(loaded.words).toHaveLength(10);
    expect(loaded.words.find((w) => w.id === 'across-1')?.answer).toBe('BASIL');
    expect(loaded.words.find((w) => w.id === 'down-1')?.answer).toBe('BAGEL');
    expect(loaded.words.find((w) => w.id === 'across-7')?.answer).toBe('TACO');
  });

  it('lists puzzles using the filename as the label', () => {
    const puzzles = listCrosswordPuzzles(resolveCrosswordPuzzlesDir());
    expect(puzzles.length).toBeGreaterThan(0);
    const foods = puzzles.find((p) => p.id === 'foods');
    expect(foods?.label).toBe('foods.json');
  });
});
