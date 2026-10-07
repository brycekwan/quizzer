import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function GamePlayHeader({
  game,
  title,
  topic,
  score,
  elapsedLabel,
  instructions,
}: {
  game: string;
  title?: string;
  topic?: string | null;
  score?: number;
  elapsedLabel: string;
  instructions: ReactNode;
}) {
  const topicText = topic?.trim() ?? '';

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 pb-1">
      <h1 className="col-start-1 row-start-1 max-w-[min(40vw,100%)] break-words text-[0.65rem] font-extrabold uppercase leading-tight tracking-wider text-grape">
        {game}
      </h1>
      <div className="col-start-2 row-start-1 flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
        {instructions}
        <Button
          asChild
          variant="outline"
          size="xs"
          className="border-2 shadow-none"
        >
          <Link to="/">Lobby</Link>
        </Button>
      </div>
      <div className="col-span-2 col-start-1 row-start-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
        {title ? (
          <p className="min-w-0 break-words font-display text-lg font-bold leading-tight sm:text-xl">
            {title}
          </p>
        ) : (
          <span />
        )}
        {score != null ? (
          <p
            className="text-center"
            aria-live="polite"
            aria-label={`Score ${score}`}
          >
            <span className="block text-[0.65rem] font-extrabold uppercase tracking-wider text-ink/45">
              Score
            </span>
            <span className="block font-display text-xl font-bold tabular-nums leading-none text-grape sm:text-2xl">
              {score}
            </span>
          </p>
        ) : (
          <span />
        )}
        <p
          className="justify-self-end text-right font-display text-xl font-bold tabular-nums leading-none sm:text-2xl"
          aria-live="polite"
          aria-label={`Elapsed time ${elapsedLabel}`}
        >
          {elapsedLabel}
        </p>
      </div>
      {topicText ? (
        <p className="col-span-2 col-start-1 row-start-3 min-w-0 break-words text-[0.65rem] font-extrabold uppercase tracking-wider text-grape">
          {topicText}
        </p>
      ) : null}
    </header>
  );
}
