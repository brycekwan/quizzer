import { cn } from '@/lib/utils';

export function SudokuKeyboard({
  draftMode,
  drafts,
  wrongDrafts,
  disabled,
  onDigit,
}: {
  draftMode: boolean;
  drafts: number[];
  wrongDrafts: number[];
  disabled: boolean;
  onDigit: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-1" role="group" aria-label="Numbers">
      {Array.from({ length: 9 }, (_, index) => {
        const value = index + 1;
        const noted = drafts.includes(value);
        const wrong = wrongDrafts.includes(value);
        const pressed = draftMode && noted;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={draftMode && !wrong ? pressed : undefined}
            aria-label={keyLabel(value, draftMode, noted, wrong)}
            disabled={disabled || wrong}
            onClick={() => onDigit(value)}
            className={cn(
              'h-12 rounded-xl border-2 border-ink/15 bg-white font-display text-xl font-bold text-ink shadow-pop-sm disabled:opacity-100',
              pressed && !wrong && 'translate-y-0.5 bg-ink/15 shadow-none',
              !draftMode && noted && !wrong && 'bg-ink/10 ring-2 ring-grape',
              wrong && 'bg-[#ffc9c9] text-ink'
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function keyLabel(
  value: number,
  draftMode: boolean,
  noted: boolean,
  wrong: boolean
): string {
  if (wrong) {
    return `${value}, incorrect`;
  }
  if (!noted) {
    return String(value);
  }
  if (draftMode) {
    return `${value}, in notes`;
  }
  return `${value}, noted`;
}
