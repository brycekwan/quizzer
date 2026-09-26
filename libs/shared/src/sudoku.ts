export const SUDOKU_SIZE = 9;
export const SUDOKU_BOX = 3;

export const SUDOKU_POINTS_PER_CORRECT = 10;
export const SUDOKU_POINTS_PER_INCORRECT = -10;
export const SUDOKU_COMPLETION_BONUS = 100;
export const SUDOKU_HINT_MAX = 3;
export const SUDOKU_POINTS_PER_UNUSED_HINT = 10;

export const SUDOKU_RANK_BONUS_FIRST = 1000;
export const SUDOKU_RANK_BONUS_STEP = 100;
export const SUDOKU_RANK_BONUS_MAX_PLACE = 10;

export interface SudokuFile {
  id: string;
  title: string;
  /** Completed 9×9 board. Never sent to players. */
  solution: number[][];
  /** Starting digits. `null` is an empty cell. */
  givens: (number | null)[][];
}

export interface SudokuPublicPuzzle {
  id: string;
  title: string;
  rows: number;
  cols: number;
}

export interface SudokuCellState {
  given: boolean;
  /** Large digit for a given, a correct entry, or a hint. */
  value: number | null;
  solved: boolean;
  hinted: boolean;
  drafts: number[];
  wrongDrafts: number[];
}

export interface SudokuPlayerSnapshot {
  puzzle: SudokuPublicPuzzle;
  cells: SudokuCellState[][];
  /** Player points only. The placement bonus is not included. */
  score: number;
  hintsUsed: number;
  hintsMax: number;
  completed: boolean;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface SudokuPuzzleInfo {
  id: string;
  /** Filename used as the admin dropdown label (e.g. `sample.json`). */
  label: string;
}

export interface SudokuAdminEntry {
  playerId: string;
  name: string;
  /** Player score plus the placement bonus for the current order. */
  score: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface SudokuAdminSnapshot {
  puzzleId: string;
  title: string;
  pendingPuzzleId: string;
  puzzles: SudokuPuzzleInfo[];
  players: SudokuAdminEntry[];
}

export function sudokuPlayerScore(
  correctCount: number,
  incorrectCount: number,
  completed: boolean,
  hintsUsed: number
): number {
  const correct = Math.max(0, correctCount) * SUDOKU_POINTS_PER_CORRECT;
  const incorrect = Math.max(0, incorrectCount) * SUDOKU_POINTS_PER_INCORRECT;
  let score = correct + incorrect;
  if (completed) {
    const unused = Math.max(0, SUDOKU_HINT_MAX - Math.max(0, hintsUsed));
    score += SUDOKU_COMPLETION_BONUS + unused * SUDOKU_POINTS_PER_UNUSED_HINT;
  }
  return score;
}

/** 1-based rank → placement bonus (1st=1000 … 10th=100; otherwise 0). */
export function sudokuRankBonus(rank: number): number {
  if (
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > SUDOKU_RANK_BONUS_MAX_PLACE
  ) {
    return 0;
  }
  return SUDOKU_RANK_BONUS_FIRST - (rank - 1) * SUDOKU_RANK_BONUS_STEP;
}

export function sudokuAdminScore(playerScore: number, rank: number): number {
  return playerScore + sudokuRankBonus(rank);
}
