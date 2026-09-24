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

export interface CrosswordAdminEntry {
  playerId: string;
  name: string;
  correctWordCount: number;
  totalWords: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface CrosswordAdminSnapshot {
  puzzleId: string;
  title: string;
  totalWords: number;
  players: CrosswordAdminEntry[];
}

export const MAX_CROSSWORD_CLUES_PER_DIRECTION = 5;
