export type GameStatus = 'waiting' | 'active' | 'paused' | 'finished';

export type GamePhase =
  | 'multiplier'
  | 'answering'
  | 'reveal'
  | 'leaderboard'
  | null;

export interface AnswerOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface Question {
  id: string;
  question: string;
  answers: AnswerOption[];
  /** Optional per-question score override for defaultScore */
  score?: number;
  /** Optional score multiplier (e.g. 2 = double points). Triggers a splash before answering. */
  multiplier?: number;
}

export interface QuestionsFile {
  questions: Question[];
}

export interface GameConfig {
  timeLimitSeconds: number;
  defaultScore: number;
  minScore: number;
  scaleMs: number;
}

/** Minimum configurable seconds per question. */
export const MIN_TIME_LIMIT_SECONDS = 10;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  timeLimitSeconds: 30,
  defaultScore: 1000,
  minScore: 100,
  scaleMs: 100,
};

export const MULTIPLIER_SPLASH_DURATION_MS = 5_000;
export const REVEAL_DURATION_MS = 2_000;
export const LEADERBOARD_DURATION_MS = 3_000;

export interface PlayerPublic {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  score: number;
}

export interface QuestionPublic {
  id: string;
  question: string;
  answers: Array<{ id: string; text: string; correct?: boolean }>;
  index: number;
  total: number;
  multiplier?: number;
}

export interface ViewerAnswer {
  answerId: string;
  points: number;
  correct: boolean;
}

export interface GameStateSnapshot {
  status: GameStatus;
  phase: GamePhase;
  config: GameConfig;
  players: PlayerPublic[];
  leaderboard: LeaderboardEntry[];
  currentQuestion: QuestionPublic | null;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  phaseEndsAt: number | null;
  serverNow: number;
  remainingMs: number;
  questionIndex: number;
  totalQuestions: number;
  /** Present for the receiving player when they have answered the current question. */
  viewerAnswer?: ViewerAnswer | null;
  /** Players who still need to answer before reveal/leaderboard (0 when phase advances). */
  waitingPlayerCount: number;
  answeredPlayerCount: number;
  totalPlayerCount: number;
}

export interface JoinResult {
  ok: true;
  playerId: string;
  name: string;
}

export interface ErrorResult {
  ok: false;
  error: string;
}
