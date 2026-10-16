/** Sent with `player:kicked` when the host removes someone from the party. */
export const SYSTEM_REMOVAL_REASON = 'Removed from the system by admin';

/** Sent with `player:kicked` when the quiz host ejects someone from the quiz only. */
export const QUIZ_REMOVAL_REASON = 'Removed from the quiz game';

/** Sent with `player:kicked` when idle timeout signs a player out. */
export const IDLE_TIMEOUT_REASON = 'Signed out due to inactivity';

/** Default connected-but-idle disconnect (30 minutes). */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;

/** Host may set 1–120 whole minutes. */
export const MIN_IDLE_TIMEOUT_MINUTES = 1;
export const MAX_IDLE_TIMEOUT_MINUTES = 120;

export interface SystemPlayerEntry {
  rank: number;
  playerId: string;
  name: string;
  /** Crossword, word search, sudoku, maze, and word survivor scores. Quiz points are excluded. */
  accumulatedScore: number;
  /** Null when the player has not entered the crossword. */
  crosswordScore: number | null;
  /** Null when the player has not entered the word search. */
  wordSearchScore: number | null;
  /** Null when the player has not entered sudoku. */
  sudokuScore: number | null;
  /** Null when the player has not entered the maze. */
  mazeScore: number | null;
  /** Null when the player has not entered word survivor. */
  wordSurvivorScore: number | null;
  /** Null when the player has not joined the quiz. */
  quizScore: number | null;
}

export const PARTY_THEMES = ['standard', 'dark', 'baby'] as const;

export type PartyTheme = (typeof PARTY_THEMES)[number];

export function isPartyTheme(value: unknown): value is PartyTheme {
  return typeof value === 'string' && (PARTY_THEMES as readonly string[]).includes(value);
}

export interface SystemAdminSnapshot {
  players: SystemPlayerEntry[];
  theme: PartyTheme;
  /** Connected players with no gameplay input for this long are signed out. */
  idleTimeoutMs: number;
}

export interface SystemScoreInput {
  playerId: string;
  name: string;
  connected: boolean;
  crosswordScore: number | null;
  wordSearchScore: number | null;
  sudokuScore: number | null;
  mazeScore: number | null;
  wordSurvivorScore: number | null;
  quizScore: number | null;
}

function accumulatedOf(player: SystemScoreInput): number {
  return (
    (player.crosswordScore ?? 0) +
    (player.wordSearchScore ?? 0) +
    (player.sudokuScore ?? 0) +
    (player.mazeScore ?? 0) +
    (player.wordSurvivorScore ?? 0)
  );
}

/** Connected players, ranked by crossword, word search, sudoku, maze, and word survivor scores. */
export function buildSystemLeaderboard(
  players: SystemScoreInput[]
): SystemAdminSnapshot {
  const ranked = players
    .filter((player) => player.connected)
    .sort((a, b) => {
      const delta = accumulatedOf(b) - accumulatedOf(a);
      if (delta !== 0) {
        return delta;
      }
      return a.name.localeCompare(b.name);
    });

  return {
    theme: 'standard',
    idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
    players: ranked.map((player, index) => ({
      rank: index + 1,
      playerId: player.playerId,
      name: player.name,
      accumulatedScore: accumulatedOf(player),
      crosswordScore: player.crosswordScore,
      wordSearchScore: player.wordSearchScore,
      sudokuScore: player.sudokuScore,
      mazeScore: player.mazeScore,
      wordSurvivorScore: player.wordSurvivorScore,
      quizScore: player.quizScore,
    })),
  };
}
