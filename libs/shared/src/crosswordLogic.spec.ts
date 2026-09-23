import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { CrosswordPuzzleFile } from './crossword';
import {
  deriveCrosswordWords,
  toPublicCrosswordPuzzle,
  validateCrosswordFile,
} from './crosswordLogic';

const foods = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../apps/server/crossword/puzzles/foods.json'),
    'utf8'
  )
) as CrosswordPuzzleFile;

const foodsMini: CrosswordPuzzleFile = {
  id: 'foods-mini',
  title: 'Foods Mini',
  grid: [
    ['P', 'I', 'E'],
    ['A', null, null],
    ['N', null, null],
  ],
  across: [{ number: 1, row: 0, col: 0, clue: 'Dessert' }],
  down: [{ number: 1, row: 0, col: 0, clue: 'Cooking vessel' }],
};

describe('crossword validation', () => {
  it('accepts a consistent mini puzzle', () => {
    expect(validateCrosswordFile(foodsMini)).toBeNull();
    const words = deriveCrosswordWords(foodsMini);
    expect('error' in words).toBe(false);
    if ('error' in words) {
      return;
    }
    expect(words).toHaveLength(2);
    expect(words.find((w) => w.direction === 'across')?.answer).toBe('PIE');
    expect(words.find((w) => w.direction === 'down')?.answer).toBe('PAN');
  });

  it('rejects more than 5 clues per direction', () => {
    const tooMany: CrosswordPuzzleFile = {
      ...foodsMini,
      across: Array.from({ length: 6 }, (_, i) => ({
        number: i + 1,
        row: 0,
        col: 0,
        clue: `Clue ${i + 1}`,
      })),
    };
    expect(validateCrosswordFile(tooMany)).toMatch(/At most 5 across/);
  });

  it('rejects an open letter run that is not covered by a clue', () => {
    const orphanRun: CrosswordPuzzleFile = {
      id: 'orphan-run',
      title: 'Orphan run',
      grid: [
        ['A', 'B', null, 'C', 'D'],
        ['E', null, null, null, null],
      ],
      across: [{ number: 1, row: 0, col: 0, clue: 'AB only' }],
      down: [{ number: 1, row: 0, col: 0, clue: 'AE' }],
    };
    expect(validateCrosswordFile(orphanRun)).toMatch(/no clue/i);
  });

  it('builds a public puzzle without answers', () => {
    const words = deriveCrosswordWords(foodsMini);
    expect('error' in words).toBe(false);
    if ('error' in words) {
      return;
    }
    const pub = toPublicCrosswordPuzzle(foodsMini, words);
    expect(pub.open[0][0]).toBe(true);
    expect(pub.open[1][1]).toBe(false);
    expect(pub.cellNumbers[0][0]).toBe(1);
    expect(pub.across[0]).not.toHaveProperty('answer');
  });

  it('accepts the foods puzzle pack with interlocking words', () => {
    const puzzle = foods as CrosswordPuzzleFile;
    expect(validateCrosswordFile(puzzle)).toBeNull();
    const words = deriveCrosswordWords(puzzle);
    expect('error' in words).toBe(false);
    if ('error' in words) {
      return;
    }
    const byId = Object.fromEntries(words.map((w) => [w.id, w.answer]));
    expect(byId['across-1']).toBe('BASIL');
    expect(byId['across-3']).toBe('GELATO');
    expect(byId['across-5']).toBe('ALMOND');
    expect(byId['across-7']).toBe('TACO');
    expect(byId['across-8']).toBe('LYCHEE');
    expect(byId['down-1']).toBe('BAGEL');
    expect(byId['down-2']).toBe('SALMON');
    expect(byId['down-4']).toBe('CARROT');
    expect(byId['down-5']).toBe('APPLE');
    expect(byId['down-6']).toBe('DATE');
  });
});
