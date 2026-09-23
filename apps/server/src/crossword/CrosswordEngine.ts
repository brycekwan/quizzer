import {
  emptyLetterGrid,
  toPublicCrosswordPuzzle,
  type CrosswordAdminEntry,
  type CrosswordAdminSnapshot,
  type CrosswordPlayerSnapshot,
  type CrosswordPuzzleFile,
  type CrosswordWord,
} from '@party/shared';

interface PlayerProgress {
  playerId: string;
  name: string;
  letters: (string | null)[][];
  correctWordIds: Set<string>;
  completedAt: number | null;
}

type Listener = () => void;

export class CrosswordEngine {
  private readonly puzzle: CrosswordPuzzleFile;
  private readonly words: CrosswordWord[];
  private readonly publicPuzzle;
  private readonly players = new Map<string, PlayerProgress>();
  private readonly listeners = new Set<Listener>();

  constructor(puzzle: CrosswordPuzzleFile, words: CrosswordWord[]) {
    this.puzzle = puzzle;
    this.words = words;
    this.publicPuzzle = toPublicCrosswordPuzzle(puzzle, words);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  get totalWords(): number {
    return this.words.length;
  }

  ensurePlayer(playerId: string, name: string): void {
    const existing = this.players.get(playerId);
    if (existing) {
      existing.name = name;
      return;
    }
    this.players.set(playerId, {
      playerId,
      name,
      letters: emptyLetterGrid(this.puzzle),
      correctWordIds: new Set(),
      completedAt: null,
    });
    this.emit();
  }

  setLetter(
    playerId: string,
    row: number,
    col: number,
    letter: string
  ): { ok: true } | { ok: false; error: string } {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: 'Join the crossword first' };
    }
    if (!this.isOpenCell(row, col)) {
      return { ok: false, error: 'Invalid cell' };
    }
    const normalized = letter.trim().toUpperCase();
    if (!/^[A-Z]$/.test(normalized)) {
      return { ok: false, error: 'Enter a single letter' };
    }
    player.letters[row][col] = normalized;
    this.recomputeWords(player);
    this.emit();
    return { ok: true };
  }

  clearLetter(
    playerId: string,
    row: number,
    col: number
  ): { ok: true } | { ok: false; error: string } {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: 'Join the crossword first' };
    }
    if (!this.isOpenCell(row, col)) {
      return { ok: false, error: 'Invalid cell' };
    }
    player.letters[row][col] = '';
    this.recomputeWords(player);
    this.emit();
    return { ok: true };
  }

  private isOpenCell(row: number, col: number): boolean {
    return (
      row >= 0 &&
      col >= 0 &&
      row < this.puzzle.grid.length &&
      col < (this.puzzle.grid[0]?.length ?? 0) &&
      this.puzzle.grid[row][col] != null
    );
  }

  private recomputeWords(player: PlayerProgress): void {
    const next = new Set<string>();
    for (const word of this.words) {
      const filled = word.cells.map(
        (cell) => player.letters[cell.row][cell.col] ?? ''
      );
      if (filled.some((letter) => !letter)) {
        continue;
      }
      if (filled.join('') === word.answer) {
        next.add(word.id);
      }
    }
    player.correctWordIds = next;
    if (next.size === this.words.length) {
      if (player.completedAt == null) {
        player.completedAt = Date.now();
      }
    } else {
      player.completedAt = null;
    }
  }

  getPlayerSnapshot(playerId: string): CrosswordPlayerSnapshot | null {
    const player = this.players.get(playerId);
    if (!player) {
      return null;
    }
    return {
      puzzle: this.publicPuzzle,
      letters: player.letters.map((row) => [...row]),
      correctWordIds: [...player.correctWordIds],
      completed: player.completedAt != null,
      completedAt: player.completedAt,
      totalWords: this.words.length,
    };
  }

  getAdminSnapshot(): CrosswordAdminSnapshot {
    const entries: CrosswordAdminEntry[] = [...this.players.values()].map(
      (player) => ({
        playerId: player.playerId,
        name: player.name,
        correctWordCount: player.correctWordIds.size,
        totalWords: this.words.length,
        completedAt: player.completedAt,
      })
    );

    entries.sort((a, b) => {
      if (a.completedAt != null && b.completedAt != null) {
        return b.completedAt - a.completedAt;
      }
      if (a.completedAt != null) {
        return -1;
      }
      if (b.completedAt != null) {
        return 1;
      }
      if (b.correctWordCount !== a.correctWordCount) {
        return b.correctWordCount - a.correctWordCount;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      puzzleId: this.puzzle.id,
      title: this.puzzle.title,
      totalWords: this.words.length,
      players: entries,
    };
  }

  reset(): { ok: true } {
    for (const player of this.players.values()) {
      player.letters = emptyLetterGrid(this.puzzle);
      player.correctWordIds = new Set();
      player.completedAt = null;
    }
    this.emit();
    return { ok: true };
  }
}
