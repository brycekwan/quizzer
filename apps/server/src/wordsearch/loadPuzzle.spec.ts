import { describe, expect, it } from 'vitest';
import {
  listWordSearchPuzzles,
  loadWordSearchPuzzle,
  resolveWordSearchPuzzlesDir,
} from './loadPuzzle';

describe('loadWordSearchPuzzle', () => {
  it('loads the canada pack', () => {
    const loaded = loadWordSearchPuzzle('canada');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.puzzle.title).toBe('Canada');
    expect(loaded.puzzle.grid).toHaveLength(20);
    expect(loaded.words).toHaveLength(10);
    expect(loaded.words.map((word) => word.word)).toEqual([
      'OTTAWA',
      'HOCKEY',
      'MOOSE',
      'BEAVER',
      'TORONTO',
      'QUEBEC',
      'NIAGARA',
      'POUTINE',
      'CALGARY',
      'MAPLE',
    ]);
  });

  it('lists puzzles using the filename as the label', () => {
    const puzzles = listWordSearchPuzzles(resolveWordSearchPuzzlesDir());
    expect(puzzles.find((puzzle) => puzzle.id === 'canada')?.label).toBe(
      'canada.json'
    );
  });
});
