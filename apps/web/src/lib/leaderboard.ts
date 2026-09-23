import type { LeaderboardEntry } from '@party/shared';

export interface FinalLeaderboardView {
  rows: Array<LeaderboardEntry & { highlight: boolean }>;
}

/** Top 10 plus current player as 11th row when ranked below top 10. */
export function buildFinalLeaderboard(
  leaderboard: LeaderboardEntry[],
  playerId: string | null
): FinalLeaderboardView {
  const top10 = leaderboard.slice(0, 10).map((entry) => ({
    ...entry,
    highlight: entry.id === playerId,
  }));

  if (!playerId) {
    return { rows: top10 };
  }

  const self = leaderboard.find((entry) => entry.id === playerId);
  if (!self) {
    return { rows: top10 };
  }

  if (self.rank <= 10) {
    return { rows: top10 };
  }

  return {
    rows: [...top10, { ...self, highlight: true }],
  };
}
