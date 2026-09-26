import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { CrosswordCluePublic, CrosswordDirection } from '@party/shared';
import { useCrosswordSocket } from '@/hooks/useCrosswordSocket';
import { CrosswordGrid } from '@/components/crossword/CrosswordGrid';
import {
  CluePanel,
  type CluePanelItem,
} from '@/components/crossword/CluePanel';
import { LetterKeyboard } from '@/components/crossword/LetterKeyboard';
import { WinnerConfetti } from '@/components/WinnerConfetti';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  buildClientWords,
  computeElapsedMs,
  directionForCell,
  firstEmptyCellInWord,
  formatElapsedMs,
  isCellCorrect,
  nextEmptyCellInWord,
  nextUnsolvedClue,
  wordsAtCell,
} from '@/lib/crosswordClient';

const DOUBLE_CLICK_MS = 400;

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

function isGridEmpty(letters: (string | null)[][]): boolean {
  return letters.every((row) => row.every((letter) => !letter));
}

function useElapsedClock(
  elapsedMs: number,
  activeSince: number | null,
  hold: boolean
): string {
  const [now, setNow] = useState(() => Date.now());
  const anchor = useRef<{
    displayMs: number;
    at: number;
    holding: boolean;
  } | null>(null);
  const previousElapsed = useRef(elapsedMs);

  useEffect(() => {
    if (hold || activeSince == null) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold, activeSince]);

  if (elapsedMs < previousElapsed.current) {
    anchor.current = null;
  }
  previousElapsed.current = elapsedMs;

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

function CrosswordInstructions({
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
      <DialogContent
        className="m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-playfield p-6 shadow-none md:m-auto md:h-fit md:max-h-[92dvh] md:w-[min(92vw,28rem)] md:overflow-y-auto md:rounded-3xl md:border-4 md:!bg-none md:!bg-cream md:shadow-pop"
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-none">
          <DialogHeader>
            <DialogTitle>How to play</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3 text-lg font-semibold leading-relaxed text-ink/80 md:text-base">
            <li>Touch or click a square to start entering a letter.</li>
            <li>Double-click a square to toggle the direction.</li>
            <li>
              Click a clue to highlight that word and start entering letters.
            </li>
          </ul>
          <p className="mt-3 text-sm font-semibold text-ink/60">
            The clock stays stopped while these instructions are open.
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

export function CrosswordPage() {
  const {
    connected,
    playerId,
    playerName,
    playerState,
    error,
    kicked,
    setLetter,
    clearLetter,
    pauseTimer,
    resumeTimer,
  } = useCrosswordSocket('player');

  const isMobile = useIsMobileViewport();
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null
  );
  const [direction, setDirection] = useState<CrosswordDirection>('across');
  const [cluesExpanded, setCluesExpanded] = useState(false);
  const selectedRef = useRef(selected);
  const directionRef = useRef(direction);
  const lastClickRef = useRef<{
    row: number;
    col: number;
    at: number;
  } | null>(null);
  const gridRef = useRef<{
    letters: (string | null)[][];
    correctWordIds: string[];
  } | null>(null);
  const keyQueueRef = useRef(Promise.resolve());
  const seenLettersRef = useRef<(string | null)[][] | null>(null);
  const puzzleIdRef = useRef<string | null>(null);
  selectedRef.current = selected;
  directionRef.current = direction;

  if (playerState && seenLettersRef.current !== playerState.letters) {
    const previousLetters = seenLettersRef.current;
    seenLettersRef.current = playerState.letters;
    const puzzleChanged = puzzleIdRef.current !== playerState.puzzle.id;
    puzzleIdRef.current = playerState.puzzle.id;
    const cleared =
      previousLetters != null &&
      !isGridEmpty(previousLetters) &&
      isGridEmpty(playerState.letters);
    if (!gridRef.current || puzzleChanged || cleared) {
      gridRef.current = {
        letters: playerState.letters,
        correctWordIds: playerState.correctWordIds,
      };
    }
  }

  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [intro, setIntro] = useState(true);
  const instructionsOpenRef = useRef(true);
  const timerChain = useRef(Promise.resolve());

  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null,
    instructionsOpen
  );

  const puzzleClockId = playerState?.puzzle.id;
  useEffect(() => {
    if (!puzzleClockId) {
      return;
    }
    timerChain.current = timerChain.current.then(async () => {
      if (instructionsOpenRef.current) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
    });
  }, [puzzleClockId, pauseTimer, resumeTimer]);

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

  const showKeyboard = isMobile && selected != null && !instructionsOpen;

  const words = useMemo(
    () => (playerState ? buildClientWords(playerState.puzzle) : []),
    [playerState]
  );

  const correctCells = useMemo(() => {
    const keys = new Set<string>();
    if (!playerState) {
      return keys;
    }
    for (let row = 0; row < playerState.puzzle.rows; row++) {
      for (let col = 0; col < playerState.puzzle.cols; col++) {
        if (
          playerState.puzzle.open[row][col] &&
          isCellCorrect(playerState.correctWordIds, words, row, col)
        ) {
          keys.add(`${row}:${col}`);
        }
      }
    }
    return keys;
  }, [playerState, words]);

  const preferredActiveWord = useMemo(() => {
    if (!selected) {
      return null;
    }
    const covering = wordsAtCell(words, selected.row, selected.col);
    return (
      covering.find((word) => word.direction === direction) ??
      covering[0] ??
      null
    );
  }, [selected, words, direction]);

  const highlighted = useMemo(() => {
    const keys = new Set<string>();
    if (!preferredActiveWord) {
      return keys;
    }
    for (const cell of preferredActiveWord.cells) {
      keys.add(`${cell.row}:${cell.col}`);
    }
    return keys;
  }, [preferredActiveWord]);

  const showAllClues = !isMobile || cluesExpanded;

  const clueItems = useMemo((): CluePanelItem[] => {
    if (!playerState) {
      return [];
    }
    const solvedIds = new Set(playerState.correctWordIds);
    const toItem = (
      direction: CrosswordDirection,
      clue: CrosswordCluePublic
    ): CluePanelItem => ({
      direction,
      clue,
      solved: solvedIds.has(`${direction}-${clue.number}`),
    });
    if (showAllClues) {
      return [
        ...playerState.puzzle.across.map((clue) => toItem('across', clue)),
        ...playerState.puzzle.down.map((clue) => toItem('down', clue)),
      ];
    }
    if (!selected) {
      return [];
    }
    const covering = wordsAtCell(words, selected.row, selected.col);
    return covering
      .map((word) => {
        const list =
          word.direction === 'across'
            ? playerState.puzzle.across
            : playerState.puzzle.down;
        const clue = list.find((c) => c.number === word.number);
        return clue ? toItem(word.direction, clue) : null;
      })
      .filter((item): item is CluePanelItem => item != null);
  }, [playerState, showAllClues, selected, words]);

  const activeClueKey = preferredActiveWord
    ? `${preferredActiveWord.direction}-${preferredActiveWord.number}`
    : null;

  const collapseClues = () => {
    setCluesExpanded(false);
  };

  const focusCell = (
    cell: { row: number; col: number },
    dir?: CrosswordDirection
  ) => {
    if (dir) {
      directionRef.current = dir;
      setDirection(dir);
    }
    selectedRef.current = cell;
    setSelected(cell);
  };

  const moveInDirection = (
    row: number,
    col: number,
    dir: CrosswordDirection,
    delta: number
  ) => {
    if (!playerState) {
      return;
    }
    let r = row;
    let c = col;
    for (let i = 0; i < 20; i++) {
      if (dir === 'across') {
        c += delta;
      } else {
        r += delta;
      }
      if (
        r < 0 ||
        c < 0 ||
        r >= playerState.puzzle.rows ||
        c >= playerState.puzzle.cols
      ) {
        return;
      }
      if (playerState.puzzle.open[r][c]) {
        focusCell({ row: r, col: c });
        return;
      }
    }
  };

  const selectCell = (row: number, col: number) => {
    if (instructionsOpenRef.current) {
      return;
    }
    collapseClues();
    const now = performance.now();
    const previousClick = lastClickRef.current;
    const sameSquare =
      selectedRef.current?.row === row && selectedRef.current?.col === col;
    const doubleClick =
      sameSquare &&
      previousClick?.row === row &&
      previousClick?.col === col &&
      now - previousClick.at <= DOUBLE_CLICK_MS;
    lastClickRef.current = { row, col, at: now };

    const covering = wordsAtCell(words, row, col);
    if (doubleClick && covering.length > 1) {
      const next = directionRef.current === 'across' ? 'down' : 'across';
      directionRef.current = next;
      setDirection(next);
      return;
    }
    if (sameSquare) {
      return;
    }

    const correctWordIds =
      gridRef.current?.correctWordIds ?? playerState?.correctWordIds ?? [];
    focusCell(
      { row, col },
      directionForCell(
        covering,
        row,
        col,
        directionRef.current,
        correctWordIds
      )
    );
  };

  const selectClue = (clue: CrosswordCluePublic, dir: CrosswordDirection) => {
    if (!playerState || instructionsOpenRef.current) {
      return;
    }
    collapseClues();
    const word = words.find(
      (entry) => entry.direction === dir && entry.number === clue.number
    );
    const letters = gridRef.current?.letters ?? playerState.letters;
    focusCell(
      word
        ? firstEmptyCellInWord(word, letters)
        : { row: clue.row, col: clue.col },
      dir
    );
  };

  const handleKey = (key: string) => {
    const run = keyQueueRef.current.then(() => applyKey(key));
    keyQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const applyKey = async (key: string) => {
    if (instructionsOpenRef.current) {
      return;
    }
    const current = selectedRef.current;
    if (!current || !playerState) {
      return;
    }
    const { row, col } = current;
    const dir = directionRef.current;
    if (key === 'Backspace' || key === 'Delete') {
      const cleared = await clearLetter(row, col);
      if (cleared.ok && cleared.correctWordIds && gridRef.current) {
        gridRef.current = {
          letters: gridRef.current.letters.map((letterRow, r) =>
            letterRow.map((letter, c) => (r === row && c === col ? '' : letter))
          ),
          correctWordIds: cleared.correctWordIds,
        };
      }
      if (key === 'Backspace') {
        moveInDirection(row, col, dir, -1);
      }
      return;
    }
    if (key === 'ArrowLeft') {
      directionRef.current = 'across';
      setDirection('across');
      moveInDirection(row, col, 'across', -1);
      return;
    }
    if (key === 'ArrowRight') {
      directionRef.current = 'across';
      setDirection('across');
      moveInDirection(row, col, 'across', 1);
      return;
    }
    if (key === 'ArrowUp') {
      directionRef.current = 'down';
      setDirection('down');
      moveInDirection(row, col, 'down', -1);
      return;
    }
    if (key === 'ArrowDown') {
      directionRef.current = 'down';
      setDirection('down');
      moveInDirection(row, col, 'down', 1);
      return;
    }
    if (key === 'Tab') {
      const next = dir === 'across' ? 'down' : 'across';
      directionRef.current = next;
      setDirection(next);
      return;
    }
    if (!/^[a-zA-Z]$/.test(key)) {
      return;
    }
    collapseClues();
    const baseline =
      gridRef.current ??
      ({
        letters: playerState.letters,
        correctWordIds: playerState.correctWordIds,
      } as const);
    const previousCorrect = new Set(baseline.correctWordIds);
    const result = await setLetter(row, col, key);
    if (!result.ok || !result.correctWordIds) {
      return;
    }
    const letters = baseline.letters.map((letterRow, r) =>
      letterRow.map((letter, c) =>
        r === row && c === col ? key.toUpperCase() : letter
      )
    );
    gridRef.current = { letters, correctWordIds: result.correctWordIds };

    const covering = wordsAtCell(words, row, col);
    const word = covering.find((entry) => entry.direction === dir) ?? covering[0];
    if (!word) {
      return;
    }
    const justSolved =
      result.correctWordIds.includes(word.id) && !previousCorrect.has(word.id);
    if (justSolved) {
      const nextClue = nextUnsolvedClue(words, word.id, result.correctWordIds);
      if (nextClue) {
        focusCell(firstEmptyCellInWord(nextClue, letters), nextClue.direction);
      }
      return;
    }
    const nextCell = nextEmptyCellInWord(word, letters, { row, col });
    if (nextCell) {
      focusCell(nextCell);
    }
  };

  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  useEffect(() => {
    if (isMobile || !selected || instructionsOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        event.key === 'Backspace' ||
        event.key === 'Delete' ||
        event.key.startsWith('Arrow') ||
        event.key === 'Tab' ||
        /^[a-zA-Z]$/.test(event.key)
      ) {
        event.preventDefault();
        void handleKeyRef.current(event.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobile, selected, instructionsOpen]);

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
        {connected ? 'Loading crossword…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
        <Button asChild size="lg" variant="outline" className="mt-8">
          <Link to="/">Return to Lobby</Link>
        </Button>
        <CrosswordInstructions
          open={instructionsOpen}
          onOpenChange={onInstructionsOpenChange}
          intro={intro}
          showTrigger={false}
        />
      </div>
    );
  }

  const grid = (
    <CrosswordGrid
      open={playerState.puzzle.open}
      cellNumbers={playerState.puzzle.cellNumbers}
      letters={playerState.letters}
      selected={selected}
      highlighted={highlighted}
      correctCells={correctCells}
      onSelect={selectCell}
    />
  );

  const clues = (
    <CluePanel
      items={clueItems}
      expanded={showAllClues}
      collapsible={isMobile}
      onToggleExpanded={() => setCluesExpanded((value) => !value)}
      onSelect={selectClue}
      activeKey={activeClueKey}
    />
  );

  const content = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
            Crossword
          </p>
          <h1 className="font-display text-2xl font-bold sm:text-4xl">
            {playerState.puzzle.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <CrosswordInstructions
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

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink/60">
          Playing as {playerName} · {playerState.correctWordIds.length}/
          {playerState.totalWords} words
        </p>
        <p
          className="shrink-0 text-sm font-semibold tabular-nums text-ink/60"
          aria-live="polite"
          aria-label={`Elapsed time ${elapsedLabel}`}
        >
          {elapsedLabel}
        </p>
      </div>

      {playerState.completed ? (
        <div className="rounded-xl border-2 border-mint/40 bg-mint/20 px-3 py-2 text-center shadow-pop-sm">
          <p className="font-display text-lg font-bold text-ink">
            Congratulations!
          </p>
          <p className="text-xs font-semibold text-ink/70">
            You completed the crossword.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-center font-bold text-coral">
          {error}
        </p>
      ) : null}

      {isMobile ? (
        <>
          {grid}
          {clues}
        </>
      ) : (
        <div className="flex items-start gap-6">
          <div className="w-full max-w-md shrink-0">{grid}</div>
          <div className="min-w-0 flex-1">{clues}</div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-playfield text-ink">
        <WinnerConfetti active={playerState.completed} />
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {content}
          </div>
          {showKeyboard ? (
            <LetterKeyboard
              onLetter={(letter) => void handleKey(letter)}
              onBackspace={() => void handleKey('Backspace')}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-playfield px-4 py-3 text-ink">
      <WinnerConfetti active={playerState.completed} />
      <div className="mx-auto w-full max-w-5xl">{content}</div>
    </div>
  );
}
