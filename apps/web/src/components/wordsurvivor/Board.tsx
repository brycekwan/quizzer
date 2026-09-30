import type { TileMark, WordSurvivorGuess } from '@party/shared';
import { cn } from '@/lib/utils';

const markClass: Record<TileMark, string> = {
  correct: 'border-mint bg-mint text-ink',
  present: 'border-sun bg-sun text-ink',
  absent: 'border-ink bg-ink text-white',
};

export function SurvivorBoard({
  length,
  maxGuesses,
  guesses,
  draft,
  showCursor,
}: {
  length: number;
  maxGuesses: number;
  guesses: WordSurvivorGuess[];
  draft: string;
  showCursor: boolean;
}) {
  const activeRow = guesses.length;
  const draftLetters = draft.split('');

  return (
    <div className="space-y-1.5" aria-label="Guesses">
      {Array.from({ length: maxGuesses }, (_, row) => {
        const guess = guesses[row];
        const isActive = row === activeRow;
        const letters = guess ? guess.word.split('') : isActive ? draftLetters : [];
        return (
          <div
            key={row}
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
          >
            {Array.from({ length }, (_, col) => {
              const letter = letters[col] ?? '';
              const mark = guess?.marks[col];
              const cursor =
                showCursor && isActive && !guess && col === draftLetters.length && col < length;
              return (
                <div
                  key={col}
                  aria-hidden={letter === ''}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-lg border-4 text-lg font-extrabold uppercase sm:text-2xl',
                    mark
                      ? markClass[mark]
                      : letter
                        ? 'border-ink bg-white text-ink'
                        : 'border-ink/15 bg-white/70 text-ink',
                    cursor && 'border-grape'
                  )}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
