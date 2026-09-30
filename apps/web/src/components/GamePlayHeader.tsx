import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function GamePlayHeader({
  game,
  title,
  detail,
  topic,
  elapsedLabel,
  instructions,
}: {
  game: string;
  title?: string;
  detail?: string;
  topic?: string | null;
  elapsedLabel: string;
  instructions: ReactNode;
}) {
  const topicText = topic?.trim() ?? '';

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 pb-2">
      <h1 className="col-start-1 row-start-1 max-w-[min(33vw,100%)] break-words text-sm font-extrabold uppercase leading-tight tracking-widest text-grape">
        {game}
      </h1>
      <div className="col-start-2 row-start-1 flex shrink-0 flex-nowrap items-center justify-end gap-2">
        {instructions}
        <Button asChild variant="outline" size="sm">
          <Link to="/">Lobby</Link>
        </Button>
      </div>
      {title ? (
        <p className="col-start-1 row-start-2 min-w-0 break-words font-display text-2xl font-bold leading-tight">
          {title}
        </p>
      ) : (
        <span className="col-start-1 row-start-2" />
      )}
      {topicText ? (
        <p className="col-start-1 row-start-3 min-w-0 break-words text-sm font-extrabold uppercase tracking-widest text-grape">
          {topicText}
        </p>
      ) : null}
      {detail ? (
        <p
          className={
            topicText
              ? 'col-start-1 row-start-4 min-w-0 text-sm font-semibold text-ink/60'
              : 'col-start-1 row-start-3 min-w-0 text-sm font-semibold text-ink/60'
          }
        >
          {detail}
        </p>
      ) : null}
      <p
        className={
          topicText
            ? 'col-start-2 row-start-3 self-center text-right font-display text-3xl font-bold tabular-nums leading-none'
            : 'col-start-2 row-start-2 self-center text-right font-display text-3xl font-bold tabular-nums leading-none'
        }
        aria-live="polite"
        aria-label={`Elapsed time ${elapsedLabel}`}
      >
        {elapsedLabel}
      </p>
    </header>
  );
}

export function GameScore({ score }: { score: number }) {
  return (
    <div className="py-2 text-center">
      <p className="text-xs font-extrabold uppercase tracking-widest text-ink/45">
        Score
      </p>
      <p
        className="font-display text-4xl font-bold tabular-nums text-grape"
        aria-live="polite"
      >
        {score}
      </p>
    </div>
  );
}
