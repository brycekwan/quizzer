import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import type { SudokuCellState } from '@party/shared';
import { SudokuGrid } from '@/components/sudoku/SudokuGrid';
import { SudokuKeyboard } from '@/components/sudoku/SudokuKeyboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSudokuSocket } from '@/hooks/useSudokuSocket';
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
    const live = computeElapsedMs(elapsedMs, activeSince, Date.now());
    if (!anchor.current?.holding) {
      anchor.current = { displayMs: live, at: Date.now(), holding: true };
    } else if (activeSince == null && elapsedMs > anchor.current.displayMs) {
      anchor.current = { displayMs: elapsedMs, at: Date.now(), holding: true };
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

function SudokuInstructions({
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
          <Button type="button" variant="outline" size="sm">
            Instructions
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-playfield p-6 shadow-none md:m-auto md:h-fit md:max-h-[92dvh] md:w-[min(92vw,32rem)] md:overflow-y-auto md:rounded-3xl md:border-4 md:!bg-none md:!bg-cream md:shadow-pop">
        <div className="flex min-h-0 flex-1 flex-col md:flex-none">
          <DialogHeader>
            <DialogTitle>How to play</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3 overflow-y-auto text-base font-semibold leading-relaxed text-ink/80 md:text-sm">
            <li>
              Fill the 9×9 grid so each row, each column, and each 3×3 box
              contains the numbers 1–9 once.
            </li>
            <li>Shaded numbers are given and cannot be changed.</li>
            <li>
              Select a square, then enter a number. A correct number turns
              green, then fades to the locked shade, and is worth 10 points. A
              wrong number stays as a small red
              note and costs 10 points. Other notes in that square stay.
            </li>
            <li>
              The timer starts on your first entry. It stays stopped while these
              instructions are open, and while you are away from the game. It
              stops when the puzzle is finished.
            </li>
            <li>
              Notes lets you pencil in candidates. Keys for numbers already in
              the square start pressed, and pressing one adds or removes that
              note. Notes are not scored.
            </li>
            <li>Erase clears the incorrect notes in the selected square.</li>
            <li>
              Hint reveals one number and is not worth points. You can use it
              up to 3 times. Each unused hint is worth 10 points when you finish.
            </li>
            <li>Finishing the puzzle is worth 100 extra points.</li>
            <li>Your score is shown above the puzzle.</li>
          </ul>
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

export function SudokuPage() {
  const {
    connected,
    playerId,
    playerName,
    playerState,
    error,
    kicked,
    setError,
    commit,
    toggleDraft,
    erase,
    hint,
    pauseTimer,
    resumeTimer,
  } = useSudokuSocket('player');
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null
  );
  const [draftMode, setDraftMode] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [intro, setIntro] = useState(true);
  const instructionsOpenRef = useRef(true);
  const timerChain = useRef(Promise.resolve());

  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null,
    instructionsOpen,
    playerState?.completed ?? false
  );

  const puzzleId = playerState?.puzzle.id;
  useEffect(() => {
    setSelected(null);
  }, [puzzleId]);

  useEffect(() => {
    if (!puzzleId) {
      return;
    }
    timerChain.current = timerChain.current.then(async () => {
      if (instructionsOpenRef.current) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
    });
  }, [puzzleId, pauseTimer, resumeTimer]);

  const onInstructionsOpenChange = (open: boolean) => {
    setInstructionsOpen(open);
    instructionsOpenRef.current = open;
    if (!open) {
      setIntro(false);
    }
    timerChain.current = timerChain.current.then(async () => {
      if (instructionsOpenRef.current) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
    });
  };

  const selectedCell: SudokuCellState | null =
    selected && playerState
      ? (playerState.cells[selected.row]?.[selected.col] ?? null)
      : null;
  const locked =
    playerState?.completed === true ||
    selectedCell?.given === true ||
    selectedCell?.solved === true;

  const enterDigit = (value: number) => {
    if (!selected || instructionsOpenRef.current || locked) {
      return;
    }
    const action = draftMode
      ? toggleDraft(selected.row, selected.col, value)
      : commit(selected.row, selected.col, value);
    void action.then((result) => {
      if (!result?.ok) {
        setError(result?.error ?? 'Could not enter that number');
        return;
      }
      setError(null);
    });
  };

  const clearMistake = () => {
    if (!selected || instructionsOpenRef.current || playerState?.completed) {
      return;
    }
    void erase(selected.row, selected.col).then((result) => {
      if (!result?.ok) {
        setError(result?.error ?? 'Could not erase');
      }
    });
  };

  const revealHint = () => {
    if (instructionsOpenRef.current || playerState?.completed) {
      return;
    }
    void hint(selected?.row, selected?.col).then((result) => {
      if (!result?.ok) {
        setError(result?.error ?? 'Could not use a hint');
      }
    });
  };

  const enterDigitRef = useRef(enterDigit);
  enterDigitRef.current = enterDigit;
  const clearMistakeRef = useRef(clearMistake);
  clearMistakeRef.current = clearMistake;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (instructionsOpenRef.current || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearMistakeRef.current();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        enterDigitRef.current(Number(event.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        {connected ? 'Loading sudoku…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
        <Button asChild size="lg" variant="outline" className="mt-8">
          <Link to="/">Return to Lobby</Link>
        </Button>
        <SudokuInstructions
          open={instructionsOpen}
          onOpenChange={onInstructionsOpenChange}
          intro={intro}
          showTrigger={false}
        />
      </div>
    );
  }

  const hintsLeft = Math.max(0, playerState.hintsMax - playerState.hintsUsed);
  const canErase = (selectedCell?.wrongDrafts.length ?? 0) > 0;

  return (
    <div className="min-h-[100dvh] bg-playfield text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col px-3 py-3">
        <header className="flex items-start justify-between gap-3 pb-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Sudoku
            </p>
            <h1 className="font-display text-2xl font-bold">
              {playerState.puzzle.title}
            </h1>
            <p className="text-sm font-semibold text-ink/60">{playerName}</p>
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
              <SudokuInstructions
                open={instructionsOpen}
                onOpenChange={onInstructionsOpenChange}
                intro={intro}
                showTrigger
              />
              <Button asChild variant="outline" size="sm">
                <Link to="/">Return to Lobby</Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="py-2 text-center">
          <p className="text-xs font-extrabold uppercase tracking-widest text-ink/45">
            Score
          </p>
          <p
            className="font-display text-4xl font-bold tabular-nums text-grape"
            aria-live="polite"
          >
            {playerState.score}
          </p>
        </div>

        {playerState.completed ? (
          <p className="mb-2 rounded-xl border-2 border-mint/40 bg-mint/20 px-3 py-2 text-center font-display font-bold">
            Puzzle complete
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="pb-2 text-center font-bold text-coral">
            {error}
          </p>
        ) : null}

        <SudokuGrid
          cells={playerState.cells}
          selected={selected}
          onSelect={(row, col) => setSelected({ row, col })}
        />

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canErase || playerState.completed}
            onClick={clearMistake}
          >
            Erase
          </Button>
          <Button
            type="button"
            variant="outline"
            className="px-2 text-sm"
            disabled={hintsLeft === 0 || playerState.completed}
            onClick={revealHint}
          >
            {hintsLeft === 1 ? '1 Hint left' : `${hintsLeft} Hints left`}
          </Button>
          <Button
            type="button"
            variant={draftMode ? 'default' : 'outline'}
            className="px-2 text-sm"
            aria-pressed={draftMode}
            disabled={playerState.completed}
            onClick={() => setDraftMode((current) => !current)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Notes
          </Button>
        </div>

        <div className="mt-3 pb-4">
          <SudokuKeyboard
            draftMode={draftMode}
            drafts={selectedCell?.drafts ?? []}
            wrongDrafts={selectedCell?.wrongDrafts ?? []}
            disabled={locked || selected == null}
            onDigit={enterDigit}
          />
        </div>
      </div>
    </div>
  );
}
