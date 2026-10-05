import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function GamePlayHeader({
  game,
  title,
  topic,
  elapsedLabel,
  instructions,
}: {
  game: string;
  title?: string;
  topic?: string | null;
  elapsedLabel: string;
  instructions: ReactNode;
}) {
  const topicText = topic?.trim() ?? '';

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 pb-1">
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
      {title ? (
        <p className="col-start-1 row-start-2 min-w-0 break-words font-display text-lg font-bold leading-tight sm:text-xl">
          {title}
        </p>
      ) : (
        <span className="col-start-1 row-start-2" />
      )}
      <p
        className="col-start-2 row-start-2 self-center text-right font-display text-xl font-bold tabular-nums leading-none sm:text-2xl"
        aria-live="polite"
        aria-label={`Elapsed time ${elapsedLabel}`}
      >
        {elapsedLabel}
      </p>
      {topicText ? (
        <p className="col-span-2 col-start-1 row-start-3 min-w-0 break-words text-[0.65rem] font-extrabold uppercase tracking-wider text-grape">
          {topicText}
        </p>
      ) : null}
    </header>
  );
}

export function GameScore({ score }: { score: number }) {
  return (
    <div className="py-1 text-center">
      <p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-ink/45">
        Score
      </p>
      <p
        className="font-display text-2xl font-bold tabular-nums leading-none text-grape sm:text-3xl"
        aria-live="polite"
      >
        {score}
      </p>
    </div>
  );
}
