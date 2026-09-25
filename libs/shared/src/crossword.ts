export type CrosswordDirection = 'across' | 'down';

export interface CrosswordClueDef {
  number: number;
  row: number;
  col: number;
  clue: string;
}

/** Grid-first puzzle file: letters are solutions; `null` is a block. */
export interface CrosswordPuzzleFile {
  id: string;
  title: string;
  grid: (string | null)[][];
  across: CrosswordClueDef[];
  down: CrosswordClueDef[];
}

export interface CrosswordCellRef {
  row: number;
  col: number;
}

export interface CrosswordWord {
  id: string;
  number: number;
  direction: CrosswordDirection;
  row: number;
  col: number;
  clue: string;
  length: number;
  answer: string;
  cells: CrosswordCellRef[];
}

export interface CrosswordCluePublic {
  number: number;
  row: number;
  col: number;
  clue: string;
  length: number;
}

export interface CrosswordPublicPuzzle {
  id: string;
  title: string;
  rows: number;
  cols: number;
  /** `true` = letter cell, `false` = block */
  open: boolean[][];
  cellNumbers: (number | null)[][];
  across: CrosswordCluePublic[];
  down: CrosswordCluePublic[];
}

export interface CrosswordPlayerSnapshot {
  puzzle: CrosswordPublicPuzzle;
  /** Same shape as grid; `null` for blocks, `''` empty, or A–Z */
  letters: (string | null)[][];
  correctWordIds: string[];
  completed: boolean;
  /**
   * Accumulated play time in ms (paused while away from the crossword).
   * When `activeSince` is set, add `now - activeSince` for the live total.
   */
  elapsedMs: number;
  /** Epoch ms when the current on-page play session started; null when paused/done */
  activeSince: number | null;
  completedAt: number | null;
  totalWords: number;
}

export interface CrosswordPuzzleInfo {
  id: string;
  /** Filename used as the admin dropdown label (e.g. `foods.json`). */
  label: string;
}

export interface CrosswordAdminEntry {
  playerId: string;
  name: string;
  correctWordCount: number;
  totalWords: number;
  /** Word points + placement bonus for the current leaderboard order. */
  score: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface CrosswordAdminSnapshot {
  puzzleId: string;
  title: string;
  /** Selected puzzle; becomes `puzzleId` on the next admin reset. */
  pendingPuzzleId: string;
  puzzles: CrosswordPuzzleInfo[];
  totalWords: number;
  players: CrosswordAdminEntry[];
}

export const MAX_CROSSWORD_CLUES_PER_DIRECTION = 5;

/** Points awarded for each correctly completed word. */
export const CROSSWORD_POINTS_PER_WORD = 100;

/** Placement bonus for 1st on the leaderboard; decreases by `CROSSWORD_RANK_BONUS_STEP` per rank. */
export const CROSSWORD_RANK_BONUS_FIRST = 1000;
export const CROSSWORD_RANK_BONUS_STEP = 100;
/** Last place that still receives a placement bonus (10th → 100 pts). */
export const CROSSWORD_RANK_BONUS_MAX_PLACE = 10;

export function crosswordWordPoints(correctWordCount: number): number {
  return Math.max(0, correctWordCount) * CROSSWORD_POINTS_PER_WORD;
}

/** 1-based rank → placement bonus (1st=1000 … 10th=100; otherwise 0). */
export function crosswordRankBonus(rank: number): number {
  if (
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > CROSSWORD_RANK_BONUS_MAX_PLACE
  ) {
    return 0;
  }
  return CROSSWORD_RANK_BONUS_FIRST - (rank - 1) * CROSSWORD_RANK_BONUS_STEP;
}

export function crosswordScore(
  correctWordCount: number,
  rank: number
): number {
  return crosswordWordPoints(correctWordCount) + crosswordRankBonus(rank);
}
