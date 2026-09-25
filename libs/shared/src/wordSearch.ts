export const WORD_SEARCH_SIZE = 20;
export const WORD_SEARCH_WORD_COUNT = 10;

export const WORD_SEARCH_DIRECTIONS = [
  'E',
  'W',
  'N',
  'S',
  'NE',
  'NW',
  'SE',
  'SW',
] as const;

export type WordSearchDirection = (typeof WORD_SEARCH_DIRECTIONS)[number];

export interface WordSearchCellRef {
  row: number;
  col: number;
}

/** Authored placement. The word is read from `row`,`col` along `direction`. */
export interface WordSearchPlacement {
  word: string;
  row: number;
  col: number;
  direction: WordSearchDirection;
}

export interface WordSearchFile {
  id: string;
  title: string;
  /** Exactly 20×20 uppercase letters. */
  grid: string[][];
  words: WordSearchPlacement[];
}

export interface WordSearchWord {
  id: string;
  word: string;
  row: number;
  col: number;
  direction: WordSearchDirection;
  cells: WordSearchCellRef[];
}

export interface WordSearchPublicPuzzle {
  id: string;
  title: string;
  rows: number;
  cols: number;
  grid: string[][];
  /** Words to find, in file order. */
  words: string[];
}

export interface WordSearchFoundWord {
  id: string;
  word: string;
  cells: WordSearchCellRef[];
}

export interface WordSearchPlayerSnapshot {
  puzzle: WordSearchPublicPuzzle;
  found: WordSearchFoundWord[];
  completed: boolean;
  /**
   * Accumulated play time in ms (paused while away from the word search).
   * When `activeSince` is set, add `now - activeSince` for the live total.
   */
  elapsedMs: number;
  /** Epoch ms when the current on-page play session started; null when paused/done */
  activeSince: number | null;
  completedAt: number | null;
  totalWords: number;
}

export interface WordSearchPuzzleInfo {
  id: string;
  /** Filename used as the admin dropdown label (e.g. `canada.json`). */
  label: string;
}

export interface WordSearchAdminEntry {
  playerId: string;
  name: string;
  foundCount: number;
  totalWords: number;
  /** Word points + placement bonus for the current leaderboard order. */
  score: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface WordSearchAdminSnapshot {
  puzzleId: string;
  title: string;
  /** Selected puzzle; becomes `puzzleId` on the next admin reset. */
  pendingPuzzleId: string;
  puzzles: WordSearchPuzzleInfo[];
  totalWords: number;
  players: WordSearchAdminEntry[];
}

/** Points awarded for each word found. */
export const WORD_SEARCH_POINTS_PER_WORD = 100;

/** Placement bonus for 1st; decreases by `WORD_SEARCH_RANK_BONUS_STEP` per rank. */
export const WORD_SEARCH_RANK_BONUS_FIRST = 1000;
export const WORD_SEARCH_RANK_BONUS_STEP = 100;
/** Last place that still receives a placement bonus (10th → 100 pts). */
export const WORD_SEARCH_RANK_BONUS_MAX_PLACE = 10;

export function wordSearchWordPoints(foundCount: number): number {
  return Math.max(0, foundCount) * WORD_SEARCH_POINTS_PER_WORD;
}

/** 1-based rank → placement bonus (1st=1000 … 10th=100; otherwise 0). */
export function wordSearchRankBonus(rank: number): number {
  if (
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > WORD_SEARCH_RANK_BONUS_MAX_PLACE
  ) {
    return 0;
  }
  return (
    WORD_SEARCH_RANK_BONUS_FIRST - (rank - 1) * WORD_SEARCH_RANK_BONUS_STEP
  );
}

export function wordSearchScore(foundCount: number, rank: number): number {
  return wordSearchWordPoints(foundCount) + wordSearchRankBonus(rank);
}
