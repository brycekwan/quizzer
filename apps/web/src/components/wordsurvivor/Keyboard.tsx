import { keyboardStates, type TileMark, type WordSurvivorGuess } from '@party/shared';
import { cn } from '@/lib/utils';

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

const markClass: Record<TileMark, string> = {
  correct: 'bg-mint text-ink',
  present: 'bg-sun text-ink',
  absent: 'bg-ink text-white',
};

export function SurvivorKeyboard({
  guesses,
  disabled,
  onLetter,
  onBackspace,
  onSubmit,
}: {
  guesses: WordSurvivorGuess[];
  disabled: boolean;
  onLetter: (letter: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
}) {
  const marks = keyboardStates(guesses);

  return (
    <div className="space-y-1.5" aria-label="Keyboard">
      {ROWS.slice(0, 2).map((row) => (
        <div key={row[0]} className="flex justify-center gap-1">
          {row.map((letter) => (
            <Key
              key={letter}
              label={letter}
              mark={marks[letter]}
              disabled={disabled}
              onClick={() => onLetter(letter)}
            />
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-1">
        <Key label="⌫" ariaLabel="Backspace" wide disabled={disabled} onClick={onBackspace} />
        {ROWS[2].map((letter) => (
          <Key
            key={letter}
            label={letter}
            mark={marks[letter]}
            disabled={disabled}
            onClick={() => onLetter(letter)}
          />
        ))}
        <Key label="Enter" wide disabled={disabled} onClick={onSubmit} />
      </div>
    </div>
  );
}

function Key({
  label,
  ariaLabel,
  mark,
  wide,
  disabled,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  mark?: TileMark;
  wide?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
        className={cn(
          'h-11 min-w-0 flex-1 rounded-lg px-0.5 text-[0.7rem] font-extrabold uppercase shadow-pop-sm disabled:opacity-40 sm:h-12 sm:text-sm',
          wide && 'flex-[1.5] text-[0.65rem] sm:text-xs',
          mark ? markClass[mark] : 'bg-ink/10 text-ink'
        )}
    >
      {label}
    </button>
  );
}
