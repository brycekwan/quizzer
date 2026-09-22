import {
  DEFAULT_GAME_CONFIG,
  LEADERBOARD_DURATION_MS,
  MULTIPLIER_SPLASH_DURATION_MS,
  REVEAL_DURATION_MS,
  computeQuestionScore,
  isNameTaken,
  isValidPlayerName,
  normalizePlayerName,
  resolveBaseScore,
  validateGameConfig,
  type GameConfig,
  type GamePhase,
  type GameStateSnapshot,
  type GameStatus,
  type LeaderboardEntry,
  type Question,
  type QuestionPublic,
  type QuestionSetInfo,
} from '@quizzer/shared';

export interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  socketId: string | null;
}

interface PendingAnswer {
  answerId: string;
  points: number;
  applied: boolean;
}

type Listener = () => void;

export interface GameEngineOptions {
  now?: () => number;
  questionSetId?: string;
  questionSets?: QuestionSetInfo[];
}

export class GameEngine {
  private players = new Map<string, Player>();
  /** Players who joined before/during this round — they see final scores when finished. */
  private participants = new Set<string>();
  private config: GameConfig = { ...DEFAULT_GAME_CONFIG };
  private status: GameStatus = 'waiting';
  private phase: GamePhase = null;
  private questionIndex = -1;
  private questionStartedAt: number | null = null;
  private questionEndsAt: number | null = null;
  private phaseEndsAt: number | null = null;
  private answers = new Map<string, PendingAnswer>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private nowFn: () => number;
  private questions: Question[];
  private questionSetId: string;
  private questionSets: QuestionSetInfo[];

  constructor(questions: Question[], options?: GameEngineOptions) {
    this.questions = questions;
    this.nowFn = options?.now ?? (() => Date.now());
    this.questionSetId = options?.questionSetId ?? 'default';
    this.questionSets = options?.questionSets ?? [
      { id: this.questionSetId, label: this.questionSetId },
    ];
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

  private now(): number {
    return this.nowFn();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    const delay = Math.max(0, ms);
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, delay);
  }

  getPlayerBySocket(socketId: string): Player | undefined {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) {
        return player;
      }
    }
    return undefined;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  setQuestionSets(sets: QuestionSetInfo[]): void {
    this.questionSets = sets;
    this.emit();
  }

  setQuestions(
    questionSetId: string,
    questions: Question[]
  ): { ok: true } | { ok: false; error: string } {
    if (this.status !== 'waiting') {
      return {
        ok: false,
        error: 'Question set can only be changed while waiting',
      };
    }
    if (questions.length === 0) {
      return { ok: false, error: 'Question set is empty' };
    }
    this.questionSetId = questionSetId;
    this.questions = questions;
    this.questionIndex = -1;
    this.emit();
    return { ok: true };
  }

  join(
    name: string,
    socketId: string,
    playerId?: string
  ): { ok: true; player: Player } | { ok: false; error: string } {
    if (!isValidPlayerName(name)) {
      return { ok: false, error: 'Name must be 1–24 characters' };
    }

    const normalized = normalizePlayerName(name);

    if (playerId) {
      const existing = this.players.get(playerId);
      if (existing) {
        existing.socketId = socketId;
        existing.connected = true;
        this.emit();
        return { ok: true, player: existing };
      }
      // After reset/kick the old id is gone — force a fresh sign-in.
      return { ok: false, error: 'Session expired — please join again' };
    }

    const names = [...this.players.values()].map((p) => p.name);
    if (isNameTaken(normalized, names)) {
      return { ok: false, error: 'That name is already taken' };
    }

    const id = playerId ?? `p_${Math.random().toString(36).slice(2, 10)}`;
    const player: Player = {
      id,
      name: normalized,
      score: 0,
      connected: true,
      socketId,
    };
    this.players.set(id, player);

    // Finishers stay in participants; post-game newcomers wait for the next round.
    if (this.status !== 'finished') {
      this.participants.add(id);
    }

    this.emit();
    return { ok: true, player };
  }

  markDisconnected(socketId: string): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) {
      return;
    }
    player.connected = false;
    player.socketId = null;
    this.emit();
  }

  kick(
    playerId: string
  ): { ok: true; socketId: string | null } | { ok: false; error: string } {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: 'Player not found' };
    }
    const socketId = player.socketId;
    this.players.delete(playerId);
    this.answers.delete(playerId);
    this.participants.delete(playerId);
    this.emit();
    return { ok: true, socketId };
  }

  updateConfig(
    partial: Partial<GameConfig>
  ): { ok: true } | { ok: false; error: string } {
    if (this.status !== 'waiting' && this.status !== 'paused') {
      return {
        ok: false,
        error: 'Config can only be changed while waiting or paused',
      };
    }

    const next = { ...this.config, ...partial };
    const validated = validateGameConfig(next);
    if (!validated.ok) {
      return validated;
    }
    this.config = validated.config;
    this.emit();
    return { ok: true };
  }

  start(): { ok: true } | { ok: false; error: string } {
    if (this.status !== 'waiting' && this.status !== 'finished') {
      return { ok: false, error: 'Game can only start from waiting' };
    }
    if (this.questions.length === 0) {
      return { ok: false, error: 'No questions loaded' };
    }
    this.clearTimer();
    this.answers.clear();
    this.participants.clear();
    for (const player of this.players.values()) {
      player.score = 0;
      this.participants.add(player.id);
    }
    this.status = 'active';
    this.questionIndex = -1;
    this.beginNextQuestion();
    return { ok: true };
  }

  pause(): { ok: true } | { ok: false; error: string } {
    if (this.status !== 'active') {
      return { ok: false, error: 'Game is not active' };
    }
    if (this.phase !== 'leaderboard') {
      return {
        ok: false,
        error: 'Pause is only allowed during the leaderboard phase',
      };
    }
    this.clearTimer();
    this.status = 'paused';
    this.phaseEndsAt = null;
    this.emit();
    return { ok: true };
  }

  resume(): { ok: true } | { ok: false; error: string } {
    if (this.status !== 'paused') {
      return { ok: false, error: 'Game is not paused' };
    }
    this.status = 'active';
    this.advanceAfterLeaderboard();
    return { ok: true };
  }

  /** Clears the room and returns connected socket ids so clients can be forced to re-sign-in. */
  reset(): { ok: true; socketIds: string[] } {
    this.clearTimer();
    const socketIds: string[] = [];
    for (const player of this.players.values()) {
      if (player.socketId) {
        socketIds.push(player.socketId);
      }
    }
    this.players.clear();
    this.participants.clear();
    this.status = 'waiting';
    this.phase = null;
    this.questionIndex = -1;
    this.questionStartedAt = null;
    this.questionEndsAt = null;
    this.phaseEndsAt = null;
    this.answers.clear();
    this.emit();
    return { ok: true, socketIds };
  }

  submitAnswer(
    playerId: string,
    answerId: string
  ): { ok: true; points: number } | { ok: false; error: string } {
    if (this.status !== 'active' || this.phase !== 'answering') {
      return { ok: false, error: 'Not accepting answers right now' };
    }

    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, error: 'Player not found' };
    }

    if (this.answers.has(playerId)) {
      return { ok: false, error: 'Answer already locked' };
    }

    const now = this.now();
    if (
      this.questionEndsAt !== null &&
      now >= this.questionEndsAt
    ) {
      return { ok: false, error: 'Time is up' };
    }

    const question = this.questions[this.questionIndex];
    if (!question) {
      return { ok: false, error: 'No active question' };
    }

    const option = question.answers.find((a) => a.id === answerId);
    if (!option) {
      return { ok: false, error: 'Invalid answer' };
    }

    const elapsedMs = Math.max(0, now - (this.questionStartedAt ?? now));
    const baseScore = resolveBaseScore(question.score, this.config);
    const points = computeQuestionScore({
      elapsedMs,
      timeLimitSeconds: this.config.timeLimitSeconds,
      scaleMs: this.config.scaleMs,
      baseScore,
      minScore: this.config.minScore,
      isCorrect: option.correct,
      multiplier: question.multiplier,
    });

    // Keep points pending until every player has answered or time expires,
    // so the shared leaderboard updates once for everyone.
    this.answers.set(playerId, { answerId, points, applied: false });
    this.emit();

    if (this.allPlayersAnswered()) {
      this.enterReveal();
    }

    return { ok: true, points };
  }

  /** Every joined player must answer (timeout still advances via the question timer). */
  private allPlayersAnswered(): boolean {
    if (this.players.size === 0) {
      return false;
    }
    return [...this.players.values()].every((p) => this.answers.has(p.id));
  }

  private getAnswerCounts(): {
    answeredPlayerCount: number;
    totalPlayerCount: number;
    waitingPlayerCount: number;
  } {
    const totalPlayerCount = this.players.size;
    const answeredPlayerCount = [...this.players.values()].filter((p) =>
      this.answers.has(p.id)
    ).length;
    const waitingPlayerCount =
      this.phase === 'answering'
        ? Math.max(0, totalPlayerCount - answeredPlayerCount)
        : 0;
    return { answeredPlayerCount, totalPlayerCount, waitingPlayerCount };
  }

  private beginNextQuestion(): void {
    this.questionIndex += 1;
    if (this.questionIndex >= this.questions.length) {
      this.status = 'finished';
      this.phase = null;
      this.questionStartedAt = null;
      this.questionEndsAt = null;
      this.phaseEndsAt = null;
      this.clearTimer();
      this.emit();
      return;
    }

    this.answers.clear();
    this.status = 'active';
    this.questionStartedAt = null;
    this.questionEndsAt = null;

    const question = this.questions[this.questionIndex];
    if (question.multiplier && question.multiplier > 1) {
      this.phase = 'multiplier';
      const splashEnds = this.now() + MULTIPLIER_SPLASH_DURATION_MS;
      this.phaseEndsAt = splashEnds;
      this.emit();
      this.schedule(splashEnds - this.now(), () => this.enterAnswering());
      return;
    }

    this.enterAnswering();
  }

  /** Starts the answer timer. Called after optional multiplier splash. */
  private enterAnswering(): void {
    if (this.status !== 'active') {
      return;
    }

    this.clearTimer();
    this.answers.clear();
    this.phase = 'answering';
    const started = this.now();
    this.questionStartedAt = started;
    this.questionEndsAt = started + this.config.timeLimitSeconds * 1000;
    this.phaseEndsAt = this.questionEndsAt;
    this.emit();

    this.schedule(this.questionEndsAt - this.now(), () => {
      this.enterReveal();
    });
  }

  private applyPendingScores(): void {
    for (const [playerId, answer] of this.answers.entries()) {
      if (answer.applied) {
        continue;
      }
      const player = this.players.get(playerId);
      if (player) {
        player.score += answer.points;
      }
      answer.applied = true;
    }
  }

  /** Players who never answered get an explicit 0-point result for this question. */
  private finalizeMissingAnswers(): void {
    for (const player of this.players.values()) {
      if (this.answers.has(player.id)) {
        continue;
      }
      this.answers.set(player.id, {
        answerId: '',
        points: 0,
        applied: false,
      });
    }
  }

  private enterReveal(): void {
    if (this.phase !== 'answering') {
      return;
    }
    this.clearTimer();
    this.finalizeMissingAnswers();
    this.applyPendingScores();
    this.phase = 'reveal';
    this.phaseEndsAt = this.now() + REVEAL_DURATION_MS;
    // Broadcast once with fully updated scores before anyone sees the leaderboard.
    this.emit();
    this.schedule(REVEAL_DURATION_MS, () => this.enterLeaderboard());
  }

  private enterLeaderboard(): void {
    if (this.phase !== 'reveal') {
      return;
    }
    this.clearTimer();
    this.phase = 'leaderboard';
    this.phaseEndsAt = this.now() + LEADERBOARD_DURATION_MS;
    this.emit();
    this.schedule(LEADERBOARD_DURATION_MS, () => this.advanceAfterLeaderboard());
  }

  private advanceAfterLeaderboard(): void {
    this.clearTimer();
    if (this.questionIndex + 1 >= this.questions.length) {
      this.status = 'finished';
      this.phase = null;
      this.questionEndsAt = null;
      this.phaseEndsAt = null;
      this.emit();
      return;
    }
    this.beginNextQuestion();
  }

  getLeaderboard(): LeaderboardEntry[] {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((p, index) => ({
        rank: index + 1,
        id: p.id,
        name: p.name,
        score: p.score,
      }));
  }

  private toQuestionPublic(includeCorrect: boolean): QuestionPublic | null {
    if (this.questionIndex < 0 || this.questionIndex >= this.questions.length) {
      return null;
    }
    const q = this.questions[this.questionIndex];
    return {
      id: q.id,
      question: q.question,
      index: this.questionIndex,
      total: this.questions.length,
      ...(q.multiplier && q.multiplier > 1 ? { multiplier: q.multiplier } : {}),
      answers: q.answers.map((a) => ({
        id: a.id,
        text: a.text,
        ...(includeCorrect ? { correct: a.correct } : {}),
      })),
    };
  }

  getRemainingMs(): number {
    const now = this.now();
    if (this.phase === 'answering' && this.questionEndsAt !== null) {
      return Math.max(0, this.questionEndsAt - now);
    }
    if (
      this.phaseEndsAt !== null &&
      (this.phase === 'multiplier' ||
        this.phase === 'reveal' ||
        this.phase === 'leaderboard')
    ) {
      return Math.max(0, this.phaseEndsAt - now);
    }
    return 0;
  }

  getSnapshot(
    role: 'player' | 'admin' = 'player',
    viewerPlayerId?: string
  ): GameStateSnapshot {
    const includeCorrect =
      role === 'admin' ||
      this.phase === 'reveal' ||
      this.phase === 'leaderboard' ||
      this.status === 'paused' ||
      this.status === 'finished';

    let viewerAnswer: GameStateSnapshot['viewerAnswer'] = null;
    if (viewerPlayerId) {
      const pending = this.answers.get(viewerPlayerId);
      if (pending) {
        const question = this.questions[this.questionIndex];
        const option = pending.answerId
          ? question?.answers.find((a) => a.id === pending.answerId)
          : undefined;
        viewerAnswer = {
          answerId: pending.answerId,
          points: pending.points,
          correct: option?.correct === true,
        };
      }
    }

    const counts = this.getAnswerCounts();
    const viewerFinishedGame =
      this.status === 'finished' &&
      Boolean(viewerPlayerId) &&
      this.participants.has(viewerPlayerId!);

    return {
      status: this.status,
      phase: this.phase,
      config: { ...this.config },
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
      })),
      leaderboard: this.getLeaderboard(),
      currentQuestion: this.toQuestionPublic(includeCorrect),
      questionStartedAt: this.questionStartedAt,
      questionEndsAt: this.questionEndsAt,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: this.now(),
      remainingMs: this.getRemainingMs(),
      questionIndex: this.questionIndex,
      totalQuestions: this.questions.length,
      viewerAnswer,
      questionSetId: this.questionSetId,
      questionSets: this.questionSets.map((s) => ({ ...s })),
      viewerFinishedGame,
      ...counts,
    };
  }

  /** Test helper: advance fake time callbacks via vitest fake timers externally */
  getStatus(): GameStatus {
    return this.status;
  }

  getPhase(): GamePhase {
    return this.phase;
  }
}
