export const PLAYER_LEADERBOARD_LIMIT = 10;

export interface PlayClock {
  elapsedMs: number;
  activeSince: number | null;
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  quizScore: number | null;
  clocks: PlayClock[];
}

export interface PartyLeaderboardSnapshot {
  overall: LeaderboardRow[];
  crossword: LeaderboardRow[];
  wordSearch: LeaderboardRow[];
  sudoku: LeaderboardRow[];
  maze: LeaderboardRow[];
  wordSurvivor: LeaderboardRow[];
  quiz: LeaderboardRow[];
}

export const PARTY_BOARD_KEYS = [
  'overall',
  'crossword',
  'wordSearch',
  'sudoku',
  'maze',
  'wordSurvivor',
  'quiz',
] as const;

export type PartyBoardKey = (typeof PARTY_BOARD_KEYS)[number];

export const PARTY_BOARD_LABELS: Record<PartyBoardKey, string> = {
  overall: 'Overall',
  crossword: 'Crossword',
  wordSearch: 'Word search',
  sudoku: 'Sudoku',
  maze: 'Maze',
  wordSurvivor: 'Word Survivor',
  quiz: 'Quiz',
};

export type VisiblePlayerRow =
  | { kind: 'gap' }
  | {
      kind: 'rank';
      highlight: boolean;
      rank: number;
      playerId: string;
      name: string;
      score: number;
      quizScore: number | null;
    };

/** Top of the board, plus the viewer's own row when they sit below that cutoff. */
export function visiblePlayerRows(
  rows: LeaderboardRow[],
  viewerId: string | null,
  limit = PLAYER_LEADERBOARD_LIMIT
): VisiblePlayerRow[] {
  const top = rows.slice(0, limit).map((row) => ({
    kind: 'rank' as const,
    highlight: viewerId != null && row.playerId === viewerId,
    rank: row.rank,
    playerId: row.playerId,
    name: row.name,
    score: row.score,
    quizScore: row.quizScore,
  }));
  if (!viewerId || top.some((row) => row.playerId === viewerId)) {
    return top;
  }
  const self = rows.find((row) => row.playerId === viewerId);
  if (!self) {
    return top;
  }
  return [
    ...top,
    { kind: 'gap' },
    {
      kind: 'rank',
      highlight: true,
      rank: self.rank,
      playerId: self.playerId,
      name: self.name,
      score: self.score,
      quizScore: self.quizScore,
    },
  ];
}
