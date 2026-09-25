import {
  crosswordScore,
  emptyLetterGrid,
  toPublicCrosswordPuzzle,
  type CrosswordAdminEntry,
  type CrosswordAdminSnapshot,
  type CrosswordPlayerSnapshot,
  type CrosswordPuzzleFile,
  type CrosswordPuzzleInfo,
  type CrosswordWord,
} from '@party/shared';

interface PlayerProgress {
  playerId: string;
  name: string;
  letters: (string | null)[][];
  correctWordIds: Set<string>;
  /** Accumulated play time while paused / completed */
  elapsedMs: number;
  /** When the current viewing session started counting; null if paused */
  activeSince: number | null;
  /** Whether the player has entered at least one letter (timer has started) */
  timerStarted: boolean;
  completedAt: number | null;
}

function currentElapsedMs(
  player: Pick<PlayerProgress, 'elapsedMs' | 'activeSince' | 'completedAt'>,
  now: number = Date.now()
): number {
  if (player.completedAt != null) {
    return player.elapsedMs;
  }
  if (player.activeSince == null) {
    return player.elapsedMs;
  }
  return player.elapsedMs + Math.max(0, now - player.activeSince);
}

type Listener = () => void;

export class CrosswordEngine {
  private puzzle: CrosswordPuzzleFile;
  private words: CrosswordWord[];
  private publicPuzzle;
  private pendingPuzzleId: string;
  private puzzles: CrosswordPuzzleInfo[];
  private readonly players = new Map<string, PlayerProgress>();
  private readonly listeners = new Set<Listener>();

  constructor(
    puzzle: CrosswordPuzzleFile,
    words: CrosswordWord[],
    options?: { puzzles?: CrosswordPuzzleInfo[]; pendingPuzzleId?: string }
  ) {
    this.puzzle = puzzle;
    this.words = words;
    this.publicPuzzle = toPublicCrosswordPuzzle(puzzle, words);
    this.puzzles = options?.puzzles ?? [
      { id: puzzle.id, label: `${puzzle.id}.json` },
    ];
    this.pendingPuzzleId = options?.pendingPuzzleId ?? puzzle.id;
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

  get activePuzzleId(): string {
    return this.puzzle.id;
  }

  getPendingPuzzleId(): string {
    return this.pendingPuzzleId;
  }

  setPuzzles(puzzles: CrosswordPuzzleInfo[]): void {
    this.puzzles = puzzles;
    this.emit();
  }

  selectPuzzle(
    puzzleId: string
  ): { ok: true } | { ok: false; error: string } {
    if (!this.puzzles.some((puzzle) => puzzle.id === puzzleId)) {
      return { ok: false, error: 'Crossword not found' };
    }
    this.pendingPuzzleId = puzzleId;
    this.emit();
    return { ok: true };
  }

  /** Swap the active puzzle (typically during reset). Clears grids to match. */
  setPuzzle(puzzle: CrosswordPuzzleFile, words: CrosswordWord[]): void {
    this.puzzle = puzzle;
    this.words = words;
    this.publicPuzzle = toPublicCrosswordPuzzle(puzzle, words);
    this.pendingPuzzleId = puzzle.id;
  }

  ensurePlayer(playerId: string, name: string): void {
    const existing = this.players.get(playerId);
    if (existing) {
      existing.name = name;
      this.emit();
      return;
    }
    this.players.set(playerId, {
      playerId,
      name,
      letters: emptyLetterGrid(this.puzzle),
      correctWordIds: new Set(),
      elapsedMs: 0,
      activeSince: null,
      timerStarted: false,
      completedAt: null,
    });
    this.emit();
  }

  /** Pause play-time accumulation (player left the crossword page). */
  pauseTimer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.activeSince == null || player.completedAt != null) {
      return;
    }
    player.elapsedMs = currentElapsedMs(player);
    player.activeSince = null;
    this.emit();
  }

  /** Resume play-time accumulation when returning to the crossword. */
  resumeTimer(playerId: string): void {
    const player = this.players.get(playerId);
    if (
      !player ||
      !player.timerStarted ||
      player.completedAt != null ||
      player.activeSince != null
    ) {
      return;
    }
    player.activeSince = Date.now();
    this.emit();
  }

  setLetter(
    playerId: string,
    row: number,
    col: number,
    letter: string
  ): { ok: true; correctWordIds: string[] } | { ok: false; error: string } {
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
    if (!player.timerStarted) {
      player.timerStarted = true;
      player.activeSince = Date.now();
    } else if (player.completedAt == null && player.activeSince == null) {
      // Typing again while somehow paused — keep counting.
      player.activeSince = Date.now();
    }
    player.letters[row][col] = normalized;
    this.recomputeWords(player);
    this.emit();
    return { ok: true, correctWordIds: [...player.correctWordIds] };
  }

  clearLetter(
    playerId: string,
    row: number,
    col: number
  ): { ok: true; correctWordIds: string[] } | { ok: false; error: string } {
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
    return { ok: true, correctWordIds: [...player.correctWordIds] };
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
        // Freeze play time at completion.
        player.elapsedMs = currentElapsedMs(player);
        player.activeSince = null;
        player.completedAt = Date.now();
      }
    } else if (player.completedAt != null) {
      // No longer complete — resume counting while they keep editing.
      player.completedAt = null;
      player.activeSince = Date.now();
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
      elapsedMs: player.elapsedMs,
      activeSince: player.activeSince,
      completedAt: player.completedAt,
      totalWords: this.words.length,
    };
  }

  private sortElapsed(
    player: {
      elapsedMs: number;
      activeSince: number | null;
      completedAt: number | null;
    },
    now: number
  ): number {
    if (
      player.completedAt == null &&
      player.activeSince == null &&
      player.elapsedMs === 0
    ) {
      return Number.POSITIVE_INFINITY;
    }
    return currentElapsedMs(player, now);
  }

  getAdminSnapshot(): CrosswordAdminSnapshot {
    const now = Date.now();
    const entries: CrosswordAdminEntry[] = [...this.players.values()].map(
      (player) => ({
        playerId: player.playerId,
        name: player.name,
        correctWordCount: player.correctWordIds.size,
        totalWords: this.words.length,
        score: 0,
        elapsedMs: player.elapsedMs,
        activeSince: player.activeSince,
        completedAt: player.completedAt,
      })
    );

    entries.sort((a, b) => {
      if (b.correctWordCount !== a.correctWordCount) {
        return b.correctWordCount - a.correctWordCount;
      }
      const ae = this.sortElapsed(a, now);
      const be = this.sortElapsed(b, now);
      if (ae !== be) {
        return ae - be;
      }
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      entry.score = crosswordScore(entry.correctWordCount, i + 1);
    }

    return {
      puzzleId: this.puzzle.id,
      title: this.puzzle.title,
      pendingPuzzleId: this.pendingPuzzleId,
      puzzles: [...this.puzzles],
      totalWords: this.words.length,
      players: entries,
    };
  }

  reset(): { ok: true } {
    for (const player of this.players.values()) {
      player.letters = emptyLetterGrid(this.puzzle);
      player.correctWordIds = new Set();
      player.elapsedMs = 0;
      player.activeSince = null;
      player.timerStarted = false;
      player.completedAt = null;
    }
    this.emit();
    return { ok: true };
  }

  removePlayer(playerId: string): void {
    if (!this.players.delete(playerId)) {
      return;
    }
    this.emit();
  }
}
