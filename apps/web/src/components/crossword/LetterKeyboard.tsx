import { cn } from '@/lib/utils';

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

export function LetterKeyboard({
  onLetter,
  onBackspace,
}: {
  onLetter: (letter: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div
      className="shrink-0 border-t-2 border-ink/10 bg-playfield px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
      role="group"
      aria-label="Letter keyboard"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-1">
        {ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-1">
            {row.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => onLetter(letter)}
                className={cn(
                  'min-h-10 flex-1 max-w-9 rounded-lg bg-white/85 text-base font-extrabold uppercase text-ink shadow-sm active:bg-sun/50'
                )}
              >
                {letter}
              </button>
            ))}
            {rowIndex === 2 ? (
              <button
                type="button"
                aria-label="Backspace"
                onClick={onBackspace}
                className="min-h-10 flex-[1.4] max-w-[3.5rem] rounded-lg bg-ink/15 px-1 text-sm font-extrabold text-ink active:bg-ink/25"
              >
                ⌫
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
