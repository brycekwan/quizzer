import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { WordSearchCellRef } from '@party/shared';
import { WordSearchGrid } from '@/components/wordsearch/WordSearchGrid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useWordSearchSocket } from '@/hooks/useWordSearchSocket';
import { computeElapsedMs, formatElapsedMs } from '@/lib/crosswordClient';

function useElapsedClock(
  elapsedMs: number,
  activeSince: number | null,
  hold: boolean,
  completed: boolean
): string {
  const [now, setNow] = useState(() => Date.now());
  const anchor = useRef<{
    displayMs: number;
    at: number;
    holding: boolean;
  } | null>(null);
  const previousElapsed = useRef(elapsedMs);

  useEffect(() => {
    if (hold || completed) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold, completed]);

  if (completed || elapsedMs < previousElapsed.current) {
    anchor.current = null;
  }
  previousElapsed.current = elapsedMs;

  if (completed) {
    return formatElapsedMs(elapsedMs);
  }

  if (hold) {
    if (!anchor.current?.holding) {
      const displayMs = anchor.current
        ? anchor.current.displayMs + (Date.now() - anchor.current.at)
        : computeElapsedMs(elapsedMs, activeSince, Date.now());
      anchor.current = { displayMs, at: Date.now(), holding: true };
    }
    return formatElapsedMs(anchor.current.displayMs);
  }

  if (anchor.current?.holding) {
    anchor.current = {
      displayMs: anchor.current.displayMs,
      at: Date.now(),
      holding: false,
    };
  }

  if (anchor.current) {
    return formatElapsedMs(
      anchor.current.displayMs + Math.max(0, Date.now() - anchor.current.at)
    );
  }

  return formatElapsedMs(computeElapsedMs(elapsedMs, activeSince, now));
}

export function WordSearchPage() {
  const {
    connected,
    playerId,
    playerName,
    playerState,
    error,
    kicked,
    submitSelection,
    pauseTimer,
    resumeTimer,
  } = useWordSearchSocket('player');
  const [selection, setSelection] = useState<WordSearchCellRef[]>([]);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const instructionsOpenRef = useRef(false);
  const timerChain = useRef(Promise.resolve());

  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null,
    instructionsOpen,
    playerState?.completed ?? false
  );

  const puzzleId = playerState?.puzzle.id;
  useEffect(() => {
    setSelection([]);
  }, [puzzleId]);

  const onInstructionsOpenChange = (open: boolean) => {
    setInstructionsOpen(open);
    instructionsOpenRef.current = open;
    timerChain.current = timerChain.current.then(async () => {
      if (instructionsOpenRef.current) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
    });
  };

  if (!playerId || !playerName) {
    return <Navigate to="/login" replace />;
  }

  if (kicked) {
    return (
      <div className="min-h-[100dvh] bg-playfield px-4 py-8 text-center">
        <h1 className="font-display text-4xl font-bold text-ink">
          You were removed
        </h1>
        <Button asChild size="lg" className="mt-8">
          <Link to="/login">Back to login</Link>
        </Button>
      </div>
    );
  }

  if (!playerState) {
    return (
      <div className="min-h-[100dvh] bg-playfield px-4 py-8 text-center font-bold text-ink">
        {connected ? 'Loading word search…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
        <Button asChild size="lg" variant="outline" className="mt-8">
          <Link to="/">Return to Lobby</Link>
        </Button>
      </div>
    );
  }

  const foundWords = new Set(playerState.found.map((word) => word.word));

  return (
    <div className="min-h-[100dvh] bg-playfield text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col md:max-w-5xl md:px-4 md:py-3">
        <header className="flex items-start justify-between gap-3 px-3 pb-2 pt-3 md:px-0">
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Word search
            </p>
            <h1 className="font-display text-2xl font-bold">
              {playerState.puzzle.title}
            </h1>
            <p className="text-sm font-semibold text-ink/60">
              {playerName} · {playerState.found.length}/{playerState.totalWords}{' '}
              words
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p
              className="font-display text-3xl font-bold tabular-nums"
              aria-live="polite"
              aria-label={`Elapsed time ${elapsedLabel}`}
            >
              {elapsedLabel}
            </p>
            <div className="flex items-center gap-2">
              <Dialog
                open={instructionsOpen}
                onOpenChange={onInstructionsOpenChange}
              >
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Instructions
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="inset-0 left-0 top-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col rounded-none border-0 bg-playfield p-6 shadow-none md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:w-[min(92vw,28rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border-4 md:!bg-none md:!bg-cream md:shadow-pop"
                >
                  <div className="flex min-h-0 flex-1 flex-col md:flex-none">
                    <DialogHeader>
                      <DialogTitle>How to play</DialogTitle>
                    </DialogHeader>
                    <p className="text-lg font-semibold leading-relaxed text-ink/80 md:text-base">
                      Words run in any of eight directions, including backwards
                      and diagonally. Drag across the letters, or tap them one
                      at a time.
                    </p>
                    <DialogClose asChild>
                      <Button type="button" size="lg" className="mt-auto w-full md:mt-6">
                        Close
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
              <Button asChild variant="outline" size="sm">
                <Link to="/">Return to Lobby</Link>
              </Button>
            </div>
          </div>
        </header>

        {playerState.completed ? (
          <p className="mx-3 mb-2 rounded-xl border-2 border-mint/40 bg-mint/20 px-3 py-2 text-center font-display font-bold md:mx-0">
            You found every word.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="px-3 pb-2 text-center font-bold text-coral md:px-0">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
          <div className="w-full md:max-w-lg md:shrink-0">
            <WordSearchGrid
              letters={playerState.puzzle.grid}
              selection={selection}
              found={playerState.found}
              onSelectionChange={setSelection}
              onCommit={(cells) => {
                void submitSelection(cells).then((result) => {
                  if (result?.matched) {
                    setSelection([]);
                  }
                });
              }}
            />
          </div>

          <div className="min-w-0 flex-1 px-3 pb-6 pt-3 md:rounded-xl md:border-2 md:border-white/50 md:bg-white/70 md:p-3 md:shadow-pop-sm">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={selection.length === 0}
              onClick={() => setSelection([])}
            >
              Clear selection
            </Button>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-1">
              {playerState.puzzle.words.map((word) => {
                const found = foundWords.has(word);
                return (
                  <li
                    key={word}
                    className={
                      found
                        ? 'font-bold text-ink/40 line-through decoration-ink/60 decoration-2'
                        : 'font-bold text-ink'
                    }
                  >
                    {word}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
