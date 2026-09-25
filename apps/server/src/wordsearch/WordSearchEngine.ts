import {
  selectionMatchesWord,
  toPublicWordSearch,
  type WordSearchAdminEntry,
  type WordSearchAdminSnapshot,
  type WordSearchCellRef,
  type WordSearchFile,
  type WordSearchFoundWord,
  type WordSearchPlayerSnapshot,
  type WordSearchPuzzleInfo,
  type WordSearchWord,
} from '@party/shared';

interface PlayerProgress {
  playerId: string;
  name: string;
  found: WordSearchFoundWord[];
  elapsedMs: number;
  activeSince: number | null;
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

export class WordSearchEngine {
  private puzzle: WordSearchFile;
  private words: WordSearchWord[];
  private publicPuzzle;
  private pendingPuzzleId: string;
  private puzzles: WordSearchPuzzleInfo[];
  private readonly players = new Map<string, PlayerProgress>();
  private readonly listeners = new Set<Listener>();

  constructor(
    puzzle: WordSearchFile,
    words: WordSearchWord[],
    options?: { puzzles?: WordSearchPuzzleInfo[]; pendingPuzzleId?: string }
  ) {
    this.puzzle = puzzle;
    this.words = words;
    this.publicPuzzle = toPublicWordSearch(puzzle, words);
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

  setPuzzles(puzzles: WordSearchPuzzleInfo[]): void {
    this.puzzles = puzzles;
    this.emit();
  }

  selectPuzzle(
    puzzleId: string
  ): { ok: true } | { ok: false; error: string } {
    if (!this.puzzles.some((puzzle) => puzzle.id === puzzleId)) {
      return { ok: false, error: 'Word search not found' };
    }
    this.pendingPuzzleId = puzzleId;
    this.emit();
    return { ok: true };
  }

  /** Swap the active puzzle (typically during reset). */
  setPuzzle(puzzle: WordSearchFile, words: WordSearchWord[]): void {
    this.puzzle = puzzle;
    this.words = words;
    this.publicPuzzle = toPublicWordSearch(puzzle, words);
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
      found: [],
      elapsedMs: 0,
      activeSince: null,
      completedAt: null,
    });
    this.emit();
  }

  /** Pause play-time accumulation (player left the word search page). */
  pauseTimer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.activeSince == null || player.completedAt != null) {
      return;
    }
    player.elapsedMs = currentElapsedMs(player);
    player.activeSince = null;
    this.emit();
  }

  /** Resume play-time accumulation when the player is on the word search page. */
  resumeTimer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.completedAt != null || player.activeSince != null) {
      return;
    }
    player.activeSince = Date.now();
    this.emit();
  }

  submitSelection(
    playerId: string,
    cells: WordSearchCellRef[]
  ):
    | { ok: true; matched: boolean }
    | { ok: false; error: string } {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: 'Join the word search first' };
    }
    if (!Array.isArray(cells) || cells.length === 0) {
      return { ok: true, matched: false };
    }
    if (
      cells.some(
        (cell) =>
          !cell ||
          !Number.isInteger(cell.row) ||
          !Number.isInteger(cell.col)
      )
    ) {
      return { ok: false, error: 'Invalid selection' };
    }

    const match = this.words.find((word) => selectionMatchesWord(cells, word));
    if (!match) {
      return { ok: true, matched: false };
    }

    if (!player.found.some((found) => found.id === match.id)) {
      player.found.push({
        id: match.id,
        word: match.word,
        cells: match.cells.map((cell) => ({ ...cell })),
      });
      if (
        player.found.length === this.words.length &&
        player.completedAt == null
      ) {
        player.elapsedMs = currentElapsedMs(player);
        player.activeSince = null;
        player.completedAt = Date.now();
      }
      this.emit();
    }

    return { ok: true, matched: true };
  }

  getPlayerSnapshot(playerId: string): WordSearchPlayerSnapshot | null {
    const player = this.players.get(playerId);
    if (!player) {
      return null;
    }
    return {
      puzzle: this.publicPuzzle,
      found: player.found.map((found) => ({
        ...found,
        cells: found.cells.map((cell) => ({ ...cell })),
      })),
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

  getAdminSnapshot(): WordSearchAdminSnapshot {
    const now = Date.now();
    const entries: WordSearchAdminEntry[] = [...this.players.values()].map(
      (player) => ({
        playerId: player.playerId,
        name: player.name,
        foundCount: player.found.length,
        totalWords: this.words.length,
        elapsedMs: player.elapsedMs,
        activeSince: player.activeSince,
        completedAt: player.completedAt,
      })
    );

    entries.sort((a, b) => {
      if (b.foundCount !== a.foundCount) {
        return b.foundCount - a.foundCount;
      }
      const ae = this.sortElapsed(a, now);
      const be = this.sortElapsed(b, now);
      if (ae !== be) {
        return ae - be;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      puzzleId: this.puzzle.id,
      title: this.puzzle.title,
      pendingPuzzleId: this.pendingPuzzleId,
      puzzles: [...this.puzzles],
      totalWords: this.words.length,
      players: entries,
    };
  }

  resetPlayer(
    playerId: string
  ): { ok: true } | { ok: false; error: string } {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: 'Player not found' };
    }
    player.found = [];
    player.elapsedMs = 0;
    player.activeSince = null;
    player.completedAt = null;
    this.emit();
    return { ok: true };
  }

  reset(): { ok: true } {
    for (const player of this.players.values()) {
      player.found = [];
      player.elapsedMs = 0;
      player.activeSince = null;
      player.completedAt = null;
    }
    this.emit();
    return { ok: true };
  }
}
