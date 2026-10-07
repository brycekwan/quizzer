import { sudokuSymbol } from '@party/shared';
import { cn } from '@/lib/utils';

export function SudokuKeyboard({
  alphabet,
  draftMode,
  drafts,
  wrongDrafts,
  disabled,
  onDigit,
}: {
  alphabet: string[];
  draftMode: boolean;
  drafts: number[];
  wrongDrafts: number[];
  disabled: boolean;
  onDigit: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-1" role="group" aria-label="Symbols">
      {Array.from({ length: 9 }, (_, index) => {
        const value = index + 1;
        const label = sudokuSymbol(alphabet, value);
        const noted = drafts.includes(value);
        const wrong = wrongDrafts.includes(value);
        const pressed = draftMode && noted;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={draftMode && !wrong ? pressed : undefined}
            aria-label={keyLabel(label, draftMode, noted, wrong)}
            disabled={disabled || wrong}
            onClick={() => onDigit(value)}
            className={cn(
              'h-12 rounded-xl border-2 border-ink/15 bg-white font-display text-xl font-bold text-ink shadow-pop-sm disabled:opacity-100',
              pressed && !wrong && 'translate-y-0.5 bg-ink/15 shadow-none',
              !draftMode && noted && !wrong && 'bg-ink/10 ring-2 ring-grape',
              wrong && 'bg-[#ffc9c9] text-ink'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function keyLabel(
  label: string,
  draftMode: boolean,
  noted: boolean,
  wrong: boolean
): string {
  if (wrong) {
    return `${label}, incorrect`;
  }
  if (!noted) {
    return label;
  }
  if (draftMode) {
    return `${label}, in notes`;
  }
  return `${label}, noted`;
}
