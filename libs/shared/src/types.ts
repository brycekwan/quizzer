export type GameStatus = 'waiting' | 'active' | 'paused' | 'finished';

export type GamePhase =
  | 'multiplier'
  | 'answering'
  | 'reveal'
  | 'leaderboard'
  | null;

export type QuestionSetMode = 'single' | 'continuous';

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

export interface QuestionSetInfo {
  id: string;
  label: string;
}

export interface GameConfig {
  timeLimitSeconds: number;
  defaultScore: number;
  minScore: number;
  scaleMs: number;
  /** How long the correct answer is shown before the leaderboard. */
  revealDurationMs: number;
  /** How long the leaderboard is shown before the next question. */
  leaderboardDurationMs: number;
}

/** Minimum configurable seconds per question. */
export const MIN_TIME_LIMIT_SECONDS = 10;

export const MIN_REVEAL_DURATION_MS = 500;
export const MAX_REVEAL_DURATION_MS = 30_000;
export const MIN_LEADERBOARD_DURATION_MS = 500;
export const MAX_LEADERBOARD_DURATION_MS = 60_000;

/** Scheduled start delay bounds (minutes). */
export const MIN_SCHEDULE_DELAY_MINUTES = 1;
export const MAX_SCHEDULE_DELAY_MINUTES = 180;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  timeLimitSeconds: 30,
  defaultScore: 1000,
  minScore: 100,
  scaleMs: 100,
  revealDurationMs: 2_000,
  leaderboardDurationMs: 3_000,
};

export const MULTIPLIER_SPLASH_DURATION_MS = 5_000;
/** Default reveal duration (also used by tests that advance timers). */
export const REVEAL_DURATION_MS = DEFAULT_GAME_CONFIG.revealDurationMs;
/** Default leaderboard duration (also used by tests that advance timers). */
export const LEADERBOARD_DURATION_MS = DEFAULT_GAME_CONFIG.leaderboardDurationMs;

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
  /** Primary / first selected question pack id. */
  questionSetId: string;
  /** Selected pack ids in play order (one for single mode). */
  questionSetIds: string[];
  questionSetMode: QuestionSetMode;
  /** Available packs for the admin dropdown. */
  questionSets: QuestionSetInfo[];
  /**
   * True when the viewer played this round and the game is finished.
   * Newcomers joining after the game ends get false and should wait for the next game.
   */
  viewerFinishedGame: boolean;
  /** When set, the game will auto-start at this server timestamp. */
  scheduledStartAt: number | null;
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
