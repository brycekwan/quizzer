import { describe, expect, it } from 'vitest';
import { buildSystemLeaderboard, type SystemScoreInput } from './system';

function player(
  partial: Partial<SystemScoreInput> & Pick<SystemScoreInput, 'playerId' | 'name'>
): SystemScoreInput {
  return {
    connected: true,
    crosswordScore: null,
    wordSearchScore: null,
    quizScore: null,
    ...partial,
  };
}

describe('buildSystemLeaderboard', () => {
  it('ranks connected players by crossword plus word search, ignoring quiz', () => {
    const board = buildSystemLeaderboard([
      player({
        playerId: 'quiz-heavy',
        name: 'Quiz',
        crosswordScore: 100,
        quizScore: 5000,
      }),
      player({
        playerId: 'search',
        name: 'Search',
        wordSearchScore: 1100,
        crosswordScore: 200,
      }),
      player({
        playerId: 'away',
        name: 'Away',
        connected: false,
        crosswordScore: 9000,
      }),
      player({
        playerId: 'new',
        name: 'New',
      }),
    ]);

    expect(board.players.map((entry) => entry.name)).toEqual([
      'Search',
      'Quiz',
      'New',
    ]);
    expect(board.players.map((entry) => entry.accumulatedScore)).toEqual([
      1300, 100, 0,
    ]);
    expect(board.players.map((entry) => entry.quizScore)).toEqual([
      null,
      5000,
      null,
    ]);
    expect(board.players[0]?.rank).toBe(1);
    expect(board.players[2]?.rank).toBe(3);
  });

  it('breaks equal accumulated scores by name', () => {
    const board = buildSystemLeaderboard([
      player({ playerId: 'b', name: 'Bea', crosswordScore: 100 }),
      player({ playerId: 'a', name: 'Ada', wordSearchScore: 100 }),
    ]);
    expect(board.players.map((entry) => entry.name)).toEqual(['Ada', 'Bea']);
    expect(board.players.map((entry) => entry.rank)).toEqual([1, 2]);
  });
});
