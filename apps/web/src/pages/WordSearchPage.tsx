import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { WordSearchCellRef } from '@party/shared';
import { WordSearchGrid } from '@/components/wordsearch/WordSearchGrid';
import { Button } from '@/components/ui/button';
import { useWordSearchSocket } from '@/hooks/useWordSearchSocket';
import { computeElapsedMs, formatElapsedMs } from '@/lib/crosswordClient';

function useElapsedClock(
  elapsedMs: number,
  activeSince: number | null
): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (activeSince == null) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSince]);

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
  } = useWordSearchSocket('player');
  const [selection, setSelection] = useState<WordSearchCellRef[]>([]);

  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null
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
          <Link to="/">Back to menu</Link>
        </Button>
      </div>
    );
  }

  const foundWords = new Set(playerState.found.map((word) => word.word));

  return (
    <div className="min-h-[100dvh] bg-playfield text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col">
        <header className="flex items-start justify-between gap-3 px-3 pb-2 pt-3">
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
            <Button asChild variant="outline" size="sm">
              <Link to="/">Lobby</Link>
            </Button>
          </div>
        </header>

        <p className="px-3 pb-2 text-xs font-semibold leading-snug text-ink/65">
          Words run in any of eight directions, including backwards and
          diagonally. Drag across the letters, or tap them one at a time.
        </p>

        {playerState.completed ? (
          <p className="mx-3 mb-2 rounded-xl border-2 border-mint/40 bg-mint/20 px-3 py-2 text-center font-display font-bold">
            You found every word.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="px-3 pb-2 text-center font-bold text-coral">
            {error}
          </p>
        ) : null}

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

        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-3">
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

        <div className="px-3 pb-6">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={selection.length === 0}
            onClick={() => setSelection([])}
          >
            Clear selection
          </Button>
        </div>
      </div>
    </div>
  );
}
