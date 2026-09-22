import { cn } from '@/lib/utils';

const ANSWER_STYLES = [
  'bg-coral text-white',
  'bg-sky text-ink',
  'bg-sun text-ink',
  'bg-mint text-ink',
] as const;

interface AnswerGridProps {
  answers: Array<{ id: string; text: string; correct?: boolean }>;
  disabled?: boolean;
  selectedId?: string | null;
  /** When true, mark the correct answer clearly and dim the rest. */
  reveal?: boolean;
  onSelect?: (id: string) => void;
}

export function AnswerGrid({
  answers,
  disabled,
  selectedId,
  reveal,
  onSelect,
}: AnswerGridProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
      {answers.map((answer, index) => {
        const isSelected = selectedId === answer.id;
        const isCorrect = answer.correct === true;
        const showAsCorrect = reveal && isCorrect;
        const showAsWrongPick = reveal && isSelected && !isCorrect;

        return (
          <button
            key={answer.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(answer.id)}
            className={cn(
              'relative flex min-h-[3.25rem] items-center justify-center rounded-2xl px-3 py-2 text-center text-sm font-extrabold leading-snug shadow-pop transition-transform active:translate-y-1 active:shadow-none disabled:opacity-70 sm:min-h-[5.5rem] sm:rounded-3xl sm:px-4 sm:py-3 sm:text-lg',
              ANSWER_STYLES[index % ANSWER_STYLES.length],
              showAsCorrect &&
                'z-10 scale-[1.03] ring-4 ring-emerald-400 ring-offset-2 ring-offset-cream brightness-110',
              reveal && !isCorrect && 'opacity-40 grayscale',
              showAsWrongPick && 'opacity-90 ring-4 ring-red-500 ring-offset-2 ring-offset-cream',
              isSelected && !reveal && 'ring-4 ring-white ring-offset-2 ring-offset-transparent'
            )}
          >
            {showAsCorrect ? (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
                Correct
              </span>
            ) : null}
            {showAsWrongPick ? (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
                Your pick
              </span>
            ) : null}
            {answer.text}
          </button>
        );
      })}
    </div>
  );
}
