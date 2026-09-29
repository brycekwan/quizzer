export const MAZE_EASY_SIZE = 12;
export const MAZE_MEDIUM_SIZE = 15;
export const MAZE_HARD_SIZE = 20;
export const MAZE_POINTS_EASY = 200;
export const MAZE_POINTS_MEDIUM = 300;
export const MAZE_POINTS_HARD = 500;
export const MAZE_POINTS_PER_HEART = 50;
export const MAZE_LIVES = 3;
export const MAZE_SPLASH_MS = 5000;

export type MazeDifficulty = 'easy' | 'medium' | 'hard';
export type MazePhase = 'intro' | 'playing' | 'splash' | 'won' | 'lost';
export type MazeDirection = 'n' | 'e' | 's' | 'w';

export interface MazeCellRef {
  row: number;
  col: number;
}

export interface MazeWalls {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface MazeFile {
  id: string;
  title: string;
  rows: number;
  cols: number;
  start: MazeCellRef;
  target: MazeCellRef;
  open: boolean[][];
  walls: MazeWalls[][];
}

export interface MazePublicPuzzle {
  id: string;
  title: string;
  difficulty: MazeDifficulty;
  rows: number;
  cols: number;
  start: MazeCellRef;
  target: MazeCellRef;
  open: boolean[][];
  walls: MazeWalls[][];
}

export interface MazePlayerSnapshot {
  level: MazeDifficulty;
  puzzle: MazePublicPuzzle;
  position: MazeCellRef;
  visited: MazeCellRef[];
  lives: number;
  score: number;
  phase: MazePhase;
  splashUntil: number | null;
  levelsCleared: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface MazePuzzleInfo {
  id: string;
  label: string;
}

export interface MazeLevelChoice {
  puzzleId: string;
  title: string;
  pendingPuzzleId: string;
  puzzles: MazePuzzleInfo[];
}

export interface MazeAdminEntry {
  playerId: string;
  name: string;
  score: number;
  level: MazeDifficulty;
  lives: number;
  phase: MazePhase;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface MazeAdminSnapshot {
  easy: MazeLevelChoice;
  medium: MazeLevelChoice;
  hard: MazeLevelChoice;
  players: MazeAdminEntry[];
}

export function mazeSize(difficulty: MazeDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return MAZE_EASY_SIZE;
    case 'medium':
      return MAZE_MEDIUM_SIZE;
    case 'hard':
      return MAZE_HARD_SIZE;
  }
}

export function mazeCampaignScore(
  levelsCleared: number,
  lives: number,
  phase: MazePhase
): number {
  let score = 0;
  if (levelsCleared >= 1) {
    score += MAZE_POINTS_EASY;
  }
  if (levelsCleared >= 2) {
    score += MAZE_POINTS_MEDIUM;
  }
  if (levelsCleared >= 3) {
    score += MAZE_POINTS_HARD;
  }
  if (phase === 'won') {
    score += Math.max(0, lives) * MAZE_POINTS_PER_HEART;
  }
  return score;
}
