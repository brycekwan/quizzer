import { describe, expect, it } from 'vitest';
import {
  WORD_SEARCH_SIZE,
  WORD_SEARCH_WORD_COUNT,
  type WordSearchFile,
  type WordSearchPlacement,
} from './wordSearch';
import {
  deriveWordSearchWords,
  selectionMatchesWord,
  validateWordSearchFile,
} from './wordSearchLogic';

const WORDS: WordSearchPlacement[] = [
  { word: 'OTTAWA', row: 0, col: 0, direction: 'E' },
  { word: 'HOCKEY', row: 2, col: 3, direction: 'S' },
  { word: 'MOOSE', row: 1, col: 10, direction: 'SE' },
  { word: 'BEAVER', row: 5, col: 18, direction: 'W' },
  { word: 'TORONTO', row: 8, col: 2, direction: 'E' },
  { word: 'CALGARY', row: 4, col: 19, direction: 'S' },
  { word: 'NIAGARA', row: 12, col: 15, direction: 'SW' },
  { word: 'POUTINE', row: 15, col: 1, direction: 'E' },
  { word: 'QUEBEC', row: 19, col: 7, direction: 'N' },
  { word: 'MAPLE', row: 19, col: 19, direction: 'W' },
];

function samplePuzzle(): WordSearchFile {
  const grid = Array.from({ length: WORD_SEARCH_SIZE }, () =>
    Array.from({ length: WORD_SEARCH_SIZE }, () => 'X')
  );
  for (const placement of WORDS) {
    const letters = placement.word;
    const deltas: Record<string, { dr: number; dc: number }> = {
      E: { dr: 0, dc: 1 },
      W: { dr: 0, dc: -1 },
      S: { dr: 1, dc: 0 },
      N: { dr: -1, dc: 0 },
      SE: { dr: 1, dc: 1 },
      SW: { dr: 1, dc: -1 },
    };
    const { dr, dc } = deltas[placement.direction];
    for (let i = 0; i < letters.length; i++) {
      grid[placement.row + dr * i][placement.col + dc * i] = letters[i];
    }
  }
  return {
    id: 'canada',
    title: 'Canada',
    grid,
    words: WORDS,
  };
}

describe('validateWordSearchFile', () => {
  it('accepts a 20×20 grid whose placements match the letters', () => {
    const puzzle = samplePuzzle();
    expect(validateWordSearchFile(puzzle)).toBeNull();
    const words = deriveWordSearchWords(puzzle);
    expect(Array.isArray(words) && words).toHaveLength(WORD_SEARCH_WORD_COUNT);
  });

  it('rejects a grid that is not 20×20', () => {
    const puzzle = samplePuzzle();
    puzzle.grid = puzzle.grid.slice(0, 10);
    expect(validateWordSearchFile(puzzle)).toMatch(/20×20/);
  });

  it('rejects a placement that does not match the grid', () => {
    const puzzle = samplePuzzle();
    puzzle.grid[0][0] = 'Z';
    expect(validateWordSearchFile(puzzle)).toMatch(/OTTAWA/);
  });

  it('rejects duplicate words', () => {
    const puzzle = samplePuzzle();
    puzzle.words = puzzle.words.map((placement, index) =>
      index === 1 ? { ...placement, word: 'OTTAWA', row: 10, col: 0, direction: 'E' } : placement
    );
    puzzle.grid[10][0] = 'O';
    puzzle.grid[10][1] = 'T';
    puzzle.grid[10][2] = 'T';
    puzzle.grid[10][3] = 'A';
    puzzle.grid[10][4] = 'W';
    puzzle.grid[10][5] = 'A';
    expect(validateWordSearchFile(puzzle)).toMatch(/Duplicate/);
  });
});

describe('selectionMatchesWord', () => {
  it('matches a placement forward and reversed', () => {
    const words = deriveWordSearchWords(samplePuzzle());
    if ('error' in words) {
      throw new Error(words.error);
    }
    const ottawa = words[0];
    expect(selectionMatchesWord(ottawa.cells, ottawa)).toBe(true);
    expect(selectionMatchesWord([...ottawa.cells].reverse(), ottawa)).toBe(true);
    expect(selectionMatchesWord(ottawa.cells.slice(0, 3), ottawa)).toBe(false);
  });
});
