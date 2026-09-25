import { describe, expect, it } from 'vitest';
import { deriveCrosswordWords, type CrosswordPuzzleFile, type WordSearchFile, type WordSearchWord } from '@party/shared';
import { CrosswordEngine } from '../crossword/CrosswordEngine';
import { GameEngine } from '../quizzer/game/GameEngine';
import { SessionRegistry } from '../session/SessionRegistry';
import { WordSearchEngine } from '../wordsearch/WordSearchEngine';
import { SystemAdmin } from './SystemAdmin';

const crosswordPuzzle: CrosswordPuzzleFile = {
  id: 'mini',
  title: 'Mini',
  grid: [
    ['P', 'I', 'E'],
    ['A', null, null],
    ['N', null, null],
  ],
  across: [{ number: 1, row: 0, col: 0, clue: 'Dessert' }],
  down: [{ number: 1, row: 0, col: 0, clue: 'Cooking vessel' }],
};

const wordSearchPuzzle: WordSearchFile = {
  id: 'mini',
  title: 'Mini',
  grid: [
    ['C', 'A', 'T'],
    ['X', 'X', 'X'],
    ['X', 'X', 'X'],
  ],
  words: [{ word: 'CAT', row: 0, col: 0, direction: 'E' }],
};

const cat: WordSearchWord = {
  id: 'CAT',
  word: 'CAT',
  row: 0,
  col: 0,
  direction: 'E',
  cells: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ],
};

function createAdmin() {
  const words = deriveCrosswordWords(crosswordPuzzle);
  if ('error' in words) {
    throw new Error(words.error);
  }
  const sessions = new SessionRegistry();
  const quiz = new GameEngine([
    {
      id: 'q1',
      question: 'Q?',
      answers: [
        { id: 'a', text: 'A', correct: true },
        { id: 'b', text: 'B', correct: false },
      ],
    },
  ]);
  const crossword = new CrosswordEngine(crosswordPuzzle, words);
  const wordSearch = new WordSearchEngine(wordSearchPuzzle, [cat]);
  return {
    sessions,
    quiz,
    crossword,
    wordSearch,
    admin: new SystemAdmin(sessions, quiz, crossword, wordSearch),
  };
}

describe('SystemAdmin', () => {
  it('ranks connected players by crossword and word search scores and keeps quiz separate', () => {
    const { sessions, quiz, crossword, wordSearch, admin } = createAdmin();
    const ada = sessions.login('Ada', 's-ada');
    const bea = sessions.login('Bea', 's-bea');
    const cal = sessions.login('Cal', 's-cal');
    expect(ada.ok && bea.ok && cal.ok).toBe(true);
    if (!ada.ok || !bea.ok || !cal.ok) {
      return;
    }
    sessions.markDisconnected('s-cal');

    crossword.ensurePlayer(ada.session.id, 'Ada');
    crossword.setLetter(ada.session.id, 0, 0, 'P');
    crossword.setLetter(ada.session.id, 0, 1, 'I');
    crossword.setLetter(ada.session.id, 0, 2, 'E');
    crossword.setLetter(ada.session.id, 1, 0, 'A');
    crossword.setLetter(ada.session.id, 2, 0, 'N');

    wordSearch.ensurePlayer(bea.session.id, 'Bea');
    wordSearch.submitSelection(bea.session.id, cat.cells);

    const joined = quiz.join('Ada', 's-ada', ada.session.id);
    expect(joined.ok).toBe(true);
    if (!joined.ok) {
      return;
    }
    quiz.start();
    quiz.submitAnswer(ada.session.id, 'a');

    const board = admin.getSnapshot();
    expect(board.players.map((player) => player.name)).toEqual(['Ada', 'Bea']);
    const adaEntry = board.players[0];
    const beaEntry = board.players[1];
    expect(adaEntry?.accumulatedScore).toBe(1200);
    expect(adaEntry?.crosswordScore).toBe(1200);
    expect(adaEntry?.wordSearchScore).toBeNull();
    expect(adaEntry?.quizScore).toBeGreaterThan(0);
    expect(adaEntry?.accumulatedScore).toBe(adaEntry?.crosswordScore);
    expect(beaEntry?.accumulatedScore).toBe(1100);
    expect(beaEntry?.wordSearchScore).toBe(1100);
    expect(beaEntry?.quizScore).toBeNull();
  });

  it('removes the player from every game and drops their scores', () => {
    const { sessions, quiz, crossword, wordSearch, admin } = createAdmin();
    const ada = sessions.login('Ada', 's-ada');
    const bea = sessions.login('Bea', 's-bea');
    expect(ada.ok && bea.ok).toBe(true);
    if (!ada.ok || !bea.ok) {
      return;
    }

    crossword.ensurePlayer(ada.session.id, 'Ada');
    crossword.setLetter(ada.session.id, 0, 0, 'P');
    wordSearch.ensurePlayer(ada.session.id, 'Ada');
    wordSearch.submitSelection(ada.session.id, cat.cells);
    quiz.join('Ada', 's-ada', ada.session.id);
    wordSearch.ensurePlayer(bea.session.id, 'Bea');

    const removed = admin.removePlayer(ada.session.id);
    expect(removed).toEqual({ ok: true, socketId: 's-ada' });
    expect(sessions.get(ada.session.id)).toBeUndefined();
    expect(quiz.getPlayer(ada.session.id)).toBeUndefined();
    expect(crossword.getPlayerSnapshot(ada.session.id)).toBeNull();
    expect(wordSearch.getPlayerSnapshot(ada.session.id)).toBeNull();

    const board = admin.getSnapshot();
    expect(board.players.map((player) => player.playerId)).toEqual([
      bea.session.id,
    ]);
    expect(wordSearch.getAdminSnapshot().players.map((player) => player.name)).toEqual([
      'Bea',
    ]);
  });

  it('rejects a kick for someone who is not in the system', () => {
    const { admin } = createAdmin();
    expect(admin.removePlayer('missing')).toEqual({
      ok: false,
      error: 'Player not found',
    });
  });
});
