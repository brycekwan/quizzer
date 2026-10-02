import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sudokuPlayerScore, sudokuRankBonus, sudokuAdminScore } from './sudoku';
import { sudokuSolutionCount, validateSudokuFile } from './sudokuLogic';
import type { SudokuFile } from './sudoku';

function sample(): SudokuFile {
  const file = path.resolve(
    __dirname,
    '../../../apps/server/sudoku/puzzles/sample.json'
  );
  return JSON.parse(readFileSync(file, 'utf8')) as SudokuFile;
}

describe('sudoku scoring', () => {
  it('scores correct entries, mistakes, and finish bonuses', () => {
    expect(sudokuPlayerScore(2, 1, false, 0)).toBe(10);
    expect(sudokuPlayerScore(52, 0, true, 0)).toBe(520 + 100 + 30);
    expect(sudokuPlayerScore(51, 0, true, 1)).toBe(510 + 100 + 20);
    expect(sudokuPlayerScore(0, 2, false, 0)).toBe(-20);
  });

  it('adds a placement bonus only for ranks 1 through 10', () => {
    expect(sudokuRankBonus(1)).toBe(1000);
    expect(sudokuRankBonus(2)).toBe(900);
    expect(sudokuRankBonus(10)).toBe(100);
    expect(sudokuRankBonus(11)).toBe(0);
    expect(sudokuAdminScore(40, 1)).toBe(40);
    expect(sudokuAdminScore(-10, 11)).toBe(-10);
  });
});

describe('validateSudokuFile', () => {
  it('accepts the sample puzzle', () => {
    const puzzle = sample();
    expect(validateSudokuFile(puzzle)).toBeNull();
    expect(sudokuSolutionCount(puzzle.givens)).toBe(1);
  });

  it('rejects a solution that repeats a digit', () => {
    const puzzle = sample();
    const row = puzzle.solution[0];
    if (!row) {
      throw new Error('missing row');
    }
    row[0] = row[1] ?? 1;
    expect(validateSudokuFile(puzzle)).toContain('sudoku rules');
  });

  it('rejects a given that disagrees with the solution', () => {
    const puzzle = sample();
    const row = puzzle.givens[0];
    if (!row) {
      throw new Error('missing row');
    }
    row[2] = 1;
    expect(validateSudokuFile(puzzle)).toContain('does not match');
  });

  it('rejects a board with more than one solution', () => {
    const puzzle = sample();
    puzzle.givens = puzzle.solution.map((row) => row.map(() => null));
    expect(validateSudokuFile(puzzle)).toContain('exactly one solution');
  });
});
