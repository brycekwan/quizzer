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
  buildClientWords,
  computeElapsedMs,
  firstEmptyCellInWord,
  formatElapsedMs,
  isCellCorrect,
  nextEmptyCellInWord,
  wordsAtCell,
} from '@/lib/crosswordClient';

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
  } = useCrosswordSocket('player');

  const isMobile = useIsMobileViewport();
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null
  );
  const [direction, setDirection] = useState<CrosswordDirection>('across');
  const [cluesExpanded, setCluesExpanded] = useState(false);

  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null
  );

  const showKeyboard = isMobile && selected != null;

  const words = useMemo(
    () => (playerState ? buildClientWords(playerState.puzzle) : []),
    [playerState]
  );

  const activeWords = useMemo(() => {
    if (!selected) {
      return [];
    }
    const covering = wordsAtCell(words, selected.row, selected.col);
    const preferred =
      covering.find((word) => word.direction === direction) ?? covering[0];
    if (!preferred) {
      return [];
    }
    return covering.length > 1 ? covering : [preferred];
  }, [selected, words, direction]);

  const highlighted = useMemo(() => {
    const keys = new Set<string>();
    for (const word of activeWords) {
      for (const cell of word.cells) {
        keys.add(`${cell.row}:${cell.col}`);
      }
    }
    return keys;
  }, [activeWords]);

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

  const clueItems = useMemo((): CluePanelItem[] => {
    if (!playerState) {
      return [];
    }
    if (cluesExpanded) {
      return [
        ...playerState.puzzle.across.map((clue) => ({
          direction: 'across' as const,
          clue,
        })),
        ...playerState.puzzle.down.map((clue) => ({
          direction: 'down' as const,
          clue,
        })),
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
        return clue ? { direction: word.direction, clue } : null;
      })
      .filter((item): item is CluePanelItem => item != null);
  }, [playerState, cluesExpanded, selected, words]);

  const activeClueKey = preferredActiveWord
    ? `${preferredActiveWord.direction}-${preferredActiveWord.number}`
    : null;

  const collapseClues = () => {
    setCluesExpanded(false);
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
        setSelected({ row: r, col: c });
        return;
      }
    }
  };

  const advanceAfterLetter = (row: number, col: number) => {
    if (!playerState) {
      return;
    }
    const covering = wordsAtCell(words, row, col);
    const word =
      covering.find((w) => w.direction === direction) ?? covering[0];
    if (!word) {
      return;
    }
    const letters = playerState.letters.map((letterRow, r) =>
      letterRow.map((letter, c) => (r === row && c === col ? 'X' : letter))
    );
    const next = nextEmptyCellInWord(word, letters, { row, col });
    if (next) {
      setSelected(next);
    }
  };

  const selectCell = (row: number, col: number) => {
    collapseClues();
    if (
      selected?.row === row &&
      selected?.col === col &&
      wordsAtCell(words, row, col).length > 1
    ) {
      setDirection((current) => (current === 'across' ? 'down' : 'across'));
    } else {
      const covering = wordsAtCell(words, row, col);
      const preferred =
        covering.find((word) => word.direction === direction) ?? covering[0];
      if (preferred) {
        setDirection(preferred.direction);
      }
      setSelected({ row, col });
    }
  };

  const selectClue = (clue: CrosswordCluePublic, dir: CrosswordDirection) => {
    if (!playerState) {
      return;
    }
    collapseClues();
    setDirection(dir);
    const word = words.find(
      (w) => w.direction === dir && w.number === clue.number
    );
    if (word) {
      setSelected(firstEmptyCellInWord(word, playerState.letters));
    } else {
      setSelected({ row: clue.row, col: clue.col });
    }
  };

  const handleKey = async (key: string) => {
    if (!selected || !playerState) {
      return;
    }
    const { row, col } = selected;
    if (key === 'Backspace' || key === 'Delete') {
      await clearLetter(row, col);
      if (key === 'Backspace') {
        moveInDirection(row, col, direction, -1);
      }
      return;
    }
    if (key === 'ArrowLeft') {
      setDirection('across');
      moveInDirection(row, col, 'across', -1);
      return;
    }
    if (key === 'ArrowRight') {
      setDirection('across');
      moveInDirection(row, col, 'across', 1);
      return;
    }
    if (key === 'ArrowUp') {
      setDirection('down');
      moveInDirection(row, col, 'down', -1);
      return;
    }
    if (key === 'ArrowDown') {
      setDirection('down');
      moveInDirection(row, col, 'down', 1);
      return;
    }
    if (key === 'Tab') {
      setDirection((current) => (current === 'across' ? 'down' : 'across'));
      return;
    }
    if (/^[a-zA-Z]$/.test(key)) {
      collapseClues();
      await setLetter(row, col, key);
      advanceAfterLetter(row, col);
    }
  };

  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  useEffect(() => {
    if (isMobile || !selected) {
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
  }, [isMobile, selected]);

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
          <Link to="/">Back to menu</Link>
        </Button>
      </div>
    );
  }

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
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to menu</Link>
        </Button>
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

      <CrosswordGrid
        open={playerState.puzzle.open}
        cellNumbers={playerState.puzzle.cellNumbers}
        letters={playerState.letters}
        selected={selected}
        highlighted={highlighted}
        correctCells={correctCells}
        onSelect={selectCell}
      />

      <CluePanel
        items={clueItems}
        expanded={cluesExpanded}
        onToggleExpanded={() => setCluesExpanded((value) => !value)}
        onSelect={selectClue}
        activeKey={activeClueKey}
      />
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
      <div className="mx-auto w-full max-w-3xl">{content}</div>
    </div>
  );
}
