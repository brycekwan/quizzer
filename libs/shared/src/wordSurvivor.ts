export const WORD_LENGTHS = [5, 6, 7, 8, 9] as const;
export const WORDS_PER_LENGTH = 5;
export const WORD_COUNT = 25;
export const WORD_SURVIVOR_MAX_GUESSES = 5;
export const WORD_SURVIVOR_POINTS_PER_WORD = 100;
export const WORD_SURVIVOR_POINTS_PER_UNUSED_GUESS = 5;
export const WORD_SURVIVOR_DEFAULT_SPLASH_MS = 3000;

export type WordSurvivorPhase = 'intro' | 'playing' | 'reveal' | 'splash' | 'won' | 'lost';
export type TileMark = 'correct' | 'present' | 'absent';

export interface WordSurvivorGuess {
  word: string;
  marks: TileMark[];
}

export interface WordSurvivorPlayerSnapshot {
  wordNumber: number;
  wordCount: number;
  length: number;
  guesses: WordSurvivorGuess[];
  draft: string;
  score: number;
  phase: WordSurvivorPhase;
  /** Host hint. Empty means the player sees no topic. */
  topic: string;
  splashUntil: number | null;
  /** When the green correct word gives way to the splash. */
  revealUntil: number | null;
  wordsCleared: number;
  maxGuesses: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
  /** Present after a loss. */
  answer: string | null;
}

export interface WordLengthCount {
  length: number;
  count: number;
}

export interface WordSurvivorAdminEntry {
  playerId: string;
  name: string;
  score: number;
  wordNumber: number;
  length: number;
  phase: WordSurvivorPhase;
  wordsCleared: number;
  elapsedMs: number;
  activeSince: number | null;
  completedAt: number | null;
}

export interface WordSurvivorFileInfo {
  id: string;
  label: string;
}

export interface WordSurvivorAdminSnapshot {
  splashMs: number;
  fileId: string;
  topic: string;
  files: WordSurvivorFileInfo[];
  counts: WordLengthCount[];
  loadError: string | null;
  players: WordSurvivorAdminEntry[];
}

const MARK_RANK: Record<TileMark, number> = {
  absent: 0,
  present: 1,
  correct: 2,
};

/** Best mark seen for each letter, so a later green replaces an earlier grey. */
export function keyboardStates(
  guesses: WordSurvivorGuess[]
): Partial<Record<string, TileMark>> {
  const best: Partial<Record<string, TileMark>> = {};
  for (const guess of guesses) {
    const letters = guess.word.split('');
    letters.forEach((letter, index) => {
      const mark = guess.marks[index];
      if (!mark) {
        return;
      }
      const current = best[letter];
      if (current == null || MARK_RANK[mark] > MARK_RANK[current]) {
        best[letter] = mark;
      }
    });
  }
  return best;
}
