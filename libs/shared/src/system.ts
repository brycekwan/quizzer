/** Sent with `player:kicked` when the host removes someone from the party. */
export const SYSTEM_REMOVAL_REASON = 'Removed from the system by admin';

/** Sent with `player:kicked` when the quiz host ejects someone from the quiz only. */
export const QUIZ_REMOVAL_REASON = 'Removed from the quiz game';

export interface SystemPlayerEntry {
  rank: number;
  playerId: string;
  name: string;
  /** Crossword, word search, and sudoku scores. Quiz points are excluded. */
  accumulatedScore: number;
  /** Null when the player has not entered the crossword. */
  crosswordScore: number | null;
  /** Null when the player has not entered the word search. */
  wordSearchScore: number | null;
  /** Null when the player has not entered sudoku. */
  sudokuScore: number | null;
  /** Null when the player has not joined the quiz. */
  quizScore: number | null;
}

export interface SystemAdminSnapshot {
  players: SystemPlayerEntry[];
}

export interface SystemScoreInput {
  playerId: string;
  name: string;
  connected: boolean;
  crosswordScore: number | null;
  wordSearchScore: number | null;
  sudokuScore: number | null;
  quizScore: number | null;
}

function accumulatedOf(player: SystemScoreInput): number {
  return (
    (player.crosswordScore ?? 0) +
    (player.wordSearchScore ?? 0) +
    (player.sudokuScore ?? 0)
  );
}

/** Connected players, ranked by crossword, word search, and sudoku scores. */
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
    players: ranked.map((player, index) => ({
      rank: index + 1,
      playerId: player.playerId,
      name: player.name,
      accumulatedScore: accumulatedOf(player),
      crosswordScore: player.crosswordScore,
      wordSearchScore: player.wordSearchScore,
      sudokuScore: player.sudokuScore,
      quizScore: player.quizScore,
    })),
  };
}
