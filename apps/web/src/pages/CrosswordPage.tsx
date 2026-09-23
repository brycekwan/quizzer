import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { CrosswordCluePublic, CrosswordDirection } from '@party/shared';
import { useCrosswordSocket } from '@/hooks/useCrosswordSocket';
import { CrosswordGrid } from '@/components/crossword/CrosswordGrid';
import { ClueList } from '@/components/crossword/ClueList';
import { WinnerConfetti } from '@/components/WinnerConfetti';
import { Button } from '@/components/ui/button';
import {
  buildClientWords,
  isCellCorrect,
  wordsAtCell,
} from '@/lib/crosswordClient';

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

  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null
  );
  const [direction, setDirection] = useState<CrosswordDirection>('across');
  const inputRef = useRef<HTMLInputElement>(null);

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
    // Intersection: highlight all covering words.
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

  const activeAcross = new Set(
    activeWords.filter((w) => w.direction === 'across').map((w) => w.number)
  );
  const activeDown = new Set(
    activeWords.filter((w) => w.direction === 'down').map((w) => w.number)
  );

  useEffect(() => {
    if (!playerState || selected) {
      return;
    }
    for (let row = 0; row < playerState.puzzle.rows; row++) {
      for (let col = 0; col < playerState.puzzle.cols; col++) {
        if (playerState.puzzle.open[row][col]) {
          setSelected({ row, col });
          return;
        }
      }
    }
  }, [playerState, selected]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selected]);

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

  const selectCell = (row: number, col: number) => {
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
    inputRef.current?.focus();
  };

  const selectClue = (clue: CrosswordCluePublic, dir: CrosswordDirection) => {
    setDirection(dir);
    setSelected({ row: clue.row, col: clue.col });
    inputRef.current?.focus();
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
      await setLetter(row, col, key);
      moveInDirection(row, col, direction, 1);
    }
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
        {connected ? 'Loading crossword…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
        <Button asChild size="lg" variant="outline" className="mt-8">
          <Link to="/">Back to menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-playfield px-4 py-6 text-ink">
      <WinnerConfetti active={playerState.completed} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Crossword
            </p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              {playerState.puzzle.title}
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              Playing as {playerName} · {playerState.correctWordIds.length}/
              {playerState.totalWords} words
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Back to menu</Link>
          </Button>
        </div>

        {playerState.completed ? (
          <div className="rounded-[1.5rem] border-4 border-mint/40 bg-mint/20 px-4 py-3 text-center shadow-pop-sm">
            <p className="font-display text-2xl font-bold text-ink">
              Congratulations!
            </p>
            <p className="text-sm font-semibold text-ink/70">
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

        <input
          ref={inputRef}
          className="sr-only"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value=""
          aria-label="Crossword keyboard input"
          onChange={(event) => {
            const value = event.target.value;
            event.target.value = '';
            if (value) {
              void handleKey(value.slice(-1));
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Backspace' ||
              event.key === 'Delete' ||
              event.key.startsWith('Arrow') ||
              event.key === 'Tab'
            ) {
              event.preventDefault();
              void handleKey(event.key);
            }
          }}
        />

        <div className="grid gap-6 rounded-[1.5rem] border-4 border-white/50 bg-white/70 p-4 shadow-pop backdrop-blur sm:grid-cols-2">
          <ClueList
            title="Across"
            clues={playerState.puzzle.across}
            activeNumbers={activeAcross}
            onSelect={(clue) => selectClue(clue, 'across')}
          />
          <ClueList
            title="Down"
            clues={playerState.puzzle.down}
            activeNumbers={activeDown}
            onSelect={(clue) => selectClue(clue, 'down')}
          />
        </div>
      </div>
    </div>
  );
}
