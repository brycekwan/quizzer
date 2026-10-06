import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { wordSearchWordPoints, type WordSearchCellRef } from '@party/shared';
import { GamePlayHeader } from '@/components/GamePlayHeader';
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
import { usePlayInstructions } from '@/lib/usePlayInstructions';

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
    if (activeSince == null && elapsedMs === 0) {
      anchor.current = null;
    } else {
      anchor.current = {
        displayMs: anchor.current.displayMs,
        at: Date.now(),
        holding: false,
      };
    }
  }

  if (anchor.current) {
    return formatElapsedMs(
      anchor.current.displayMs + Math.max(0, Date.now() - anchor.current.at)
    );
  }

  return formatElapsedMs(computeElapsedMs(elapsedMs, activeSince, now));
}

function WordSearchInstructions({
  open,
  onOpenChange,
  intro,
  showTrigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intro: boolean;
  showTrigger: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="xs" className="border-2 shadow-none">
            Instructions
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        className="m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-playfield p-6 shadow-none md:m-auto md:h-fit md:max-h-[92dvh] md:w-[min(92vw,28rem)] md:overflow-y-auto md:rounded-3xl md:border-4 md:!bg-none md:!bg-cream md:shadow-pop"
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-none">
          <DialogHeader>
            <DialogTitle>How to play</DialogTitle>
          </DialogHeader>
          <p className="text-lg font-semibold leading-relaxed text-ink/80 md:text-base">
            Words run in any of eight directions, including backwards and
            diagonally. Drag across the letters, or tap them one at a time. The
            clock starts with your first selection and stays stopped while these
            instructions are open.
          </p>
          <DialogClose asChild>
            <Button type="button" size="lg" className="mt-auto w-full md:mt-6">
              {intro ? 'Start' : 'Close'}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const {
    open: instructionsOpen,
    intro,
    instructionsOpenRef,
    onOpenChange: onInstructionsOpenChange,
  } = usePlayInstructions(playerState, pauseTimer, resumeTimer);

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
        <div className="px-3 pt-3 md:px-0">
          <GamePlayHeader
            game="Word search"
            title={playerState.puzzle.title}
            score={wordSearchWordPoints(playerState.found.length)}
            elapsedLabel={elapsedLabel}
            instructions={
              <WordSearchInstructions
                open={instructionsOpen}
                onOpenChange={onInstructionsOpenChange}
                intro={intro}
                showTrigger
              />
            }
          />
        </div>

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
          <div className="w-full px-3 md:max-w-lg md:shrink-0 md:px-0">
            <WordSearchGrid
              letters={playerState.puzzle.grid}
              selection={selection}
              found={playerState.found}
              onSelectionChange={setSelection}
              onCommit={(cells) => {
                if (instructionsOpenRef.current || cells.length === 0) {
                  return;
                }
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
