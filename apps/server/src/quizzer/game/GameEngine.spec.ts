import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEADERBOARD_DURATION_MS,
  MULTIPLIER_SPLASH_DURATION_MS,
  REVEAL_DURATION_MS,
  type Question,
} from '@party/shared';
import { GameEngine } from './GameEngine';

const questions: Question[] = [
  {
    id: 'q1',
    question: 'Q1?',
    answers: [
      { id: 'a', text: 'A', correct: false },
      { id: 'b', text: 'B', correct: true },
      { id: 'c', text: 'C', correct: false },
      { id: 'd', text: 'D', correct: false },
    ],
  },
  {
    id: 'q2',
    question: 'Q2?',
    answers: [
      { id: 'a', text: 'A', correct: true },
      { id: 'b', text: 'B', correct: false },
      { id: 'c', text: 'C', correct: false },
      { id: 'd', text: 'D', correct: false },
    ],
    score: 800,
  },
];

describe('GameEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createEngine() {
    return new GameEngine(questions, { now: () => Date.now() });
  }

  it('runs answering → reveal → leaderboard → next question', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    expect(engine.start().ok).toBe(true);
    expect(engine.getPhase()).toBe('answering');

    vi.advanceTimersByTime(30_000);
    expect(engine.getPhase()).toBe('reveal');

    vi.advanceTimersByTime(REVEAL_DURATION_MS);
    expect(engine.getPhase()).toBe('leaderboard');

    vi.advanceTimersByTime(LEADERBOARD_DURATION_MS);
    expect(engine.getPhase()).toBe('answering');
    expect(engine.getSnapshot().questionIndex).toBe(1);
  });

  it('adds question points to the running total as soon as the player answers', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    engine.join('Other', 's2');
    engine.start();

    const result = engine.submitAnswer(join.player.id, 'b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Still answering (other player has not answered); points are pending.
    expect(engine.getPhase()).toBe('answering');
    expect(engine.getPlayer(join.player.id)?.score).toBe(0);
    expect(result.points).toBeGreaterThan(0);

    const snap = engine.getSnapshot('player', join.player.id);
    expect(snap.viewerAnswer?.correct).toBe(true);
    expect(snap.viewerAnswer?.points).toBe(result.points);
    expect(snap.waitingPlayerCount).toBe(1);

    // After the other player answers, scores apply together and reveal starts.
    engine.submitAnswer(
      engine.getSnapshot().players.find((p) => p.name === 'Other')!.id,
      'a'
    );
    expect(engine.getPhase()).toBe('reveal');
    expect(engine.getPlayer(join.player.id)?.score).toBe(result.points);
  });

  it('awards zero points for wrong answers', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    engine.join('Other', 's2');
    engine.start();
    const result = engine.submitAnswer(join.player.id, 'a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toBe(0);
    expect(engine.getPlayer(join.player.id)?.score).toBe(0);
    expect(engine.getSnapshot('player', join.player.id).viewerAnswer?.correct).toBe(
      false
    );
  });

  it('does not enter reveal until every player has answered', () => {
    const engine = createEngine();
    const a = engine.join('A', 's1');
    const b = engine.join('B', 's2');
    if (!a.ok || !b.ok) return;
    engine.start();
    engine.submitAnswer(a.player.id, 'b');
    expect(engine.getPhase()).toBe('answering');
    expect(engine.getPlayer(a.player.id)?.score).toBe(0);
    vi.advanceTimersByTime(30_000);
    expect(engine.getPhase()).toBe('reveal');
    expect(engine.getPlayer(a.player.id)?.score).toBeGreaterThan(0);
    expect(engine.getPlayer(b.player.id)?.score).toBe(0);
  });

  it('holds the next question until the full leaderboard duration elapses', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    engine.start();
    vi.advanceTimersByTime(30_000);
    expect(engine.getPhase()).toBe('reveal');
    vi.advanceTimersByTime(REVEAL_DURATION_MS);
    expect(engine.getPhase()).toBe('leaderboard');
    vi.advanceTimersByTime(LEADERBOARD_DURATION_MS - 1);
    expect(engine.getPhase()).toBe('leaderboard');
    vi.advanceTimersByTime(1);
    expect(engine.getPhase()).toBe('answering');
    expect(engine.getSnapshot().questionIndex).toBe(1);
  });

  it('shows a multiplier splash before answering bonus questions', () => {
    const bonusQuestions: Question[] = [
      {
        id: 'q1',
        question: 'Normal?',
        answers: [
          { id: 'a', text: 'A', correct: true },
          { id: 'b', text: 'B', correct: false },
          { id: 'c', text: 'C', correct: false },
          { id: 'd', text: 'D', correct: false },
        ],
      },
      {
        id: 'q2',
        question: 'Bonus?',
        answers: [
          { id: 'a', text: 'A', correct: true },
          { id: 'b', text: 'B', correct: false },
          { id: 'c', text: 'C', correct: false },
          { id: 'd', text: 'D', correct: false },
        ],
        multiplier: 3,
      },
    ];
    const engine = new GameEngine(bonusQuestions, { now: () => Date.now() });
    engine.join('Buddy', 's1');
    engine.start();
    expect(engine.getPhase()).toBe('answering');

    vi.advanceTimersByTime(30_000 + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
    expect(engine.getPhase()).toBe('multiplier');
    expect(engine.getSnapshot().currentQuestion?.multiplier).toBe(3);
    expect(engine.getSnapshot().questionEndsAt).toBeNull();

    vi.advanceTimersByTime(MULTIPLIER_SPLASH_DURATION_MS);
    expect(engine.getPhase()).toBe('answering');
    expect(engine.getSnapshot().questionEndsAt).not.toBeNull();

    const join = engine.getSnapshot().players[0];
    const result = engine.submitAnswer(join.id, 'a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toBe(3000);
  });

  it('accumulates running scores and resets them', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    engine.start();
    expect(engine.submitAnswer(join.player.id, 'b').ok).toBe(true);
    expect(engine.getPhase()).toBe('reveal');
    const afterQ1 = engine.getPlayer(join.player.id)!.score;
    expect(afterQ1).toBeGreaterThan(0);

    vi.advanceTimersByTime(REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
    expect(engine.getPhase()).toBe('answering');
    expect(engine.submitAnswer(join.player.id, 'a').ok).toBe(true);
    expect(engine.getPlayer(join.player.id)!.score).toBeGreaterThan(afterQ1);

    const reset = engine.reset();
    expect(reset.ok).toBe(true);
    expect(reset.socketIds).toEqual(['s1']);
    expect(engine.getStatus()).toBe('waiting');
    expect(engine.getPlayer(join.player.id)).toBeUndefined();
    expect(engine.getSnapshot().players).toHaveLength(0);
  });

  it('kicks connected sockets on reset so players must rejoin', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    const result = engine.reset();
    expect(result.socketIds).toEqual(['s1']);
  });

  it('shows final leaderboard only to players who finished the round', () => {
    const engine = createEngine();
    const buddy = engine.join('Buddy', 's1');
    expect(buddy.ok).toBe(true);
    if (!buddy.ok) return;

    engine.start();
    const cycle = 30_000 + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS;
    vi.advanceTimersByTime(cycle);
    vi.advanceTimersByTime(cycle);
    expect(engine.getStatus()).toBe('finished');
    expect(
      engine.getSnapshot('player', buddy.player.id).viewerFinishedGame
    ).toBe(true);

    const late = engine.join('Late', 's2');
    expect(late.ok).toBe(true);
    if (!late.ok) return;
    expect(
      engine.getSnapshot('player', late.player.id).viewerFinishedGame
    ).toBe(false);
    expect(
      engine.getSnapshot('player', buddy.player.id).viewerFinishedGame
    ).toBe(true);
  });

  it('allows the same player id to re-enter after reset', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    engine.reset();
    const reenter = engine.join('Buddy', 's2', join.player.id);
    expect(reenter.ok).toBe(true);
    if (!reenter.ok) return;
    expect(reenter.player.id).toBe(join.player.id);
  });

  it('switches question sets while waiting', () => {
    const engine = createEngine();
    const next: Question[] = [
      {
        id: 'n1',
        question: 'Next?',
        answers: [
          { id: 'a', text: 'A', correct: true },
          { id: 'b', text: 'B', correct: false },
          { id: 'c', text: 'C', correct: false },
          { id: 'd', text: 'D', correct: false },
        ],
      },
    ];
    expect(engine.setQuestions(['canada'], next).ok).toBe(true);
    expect(engine.getSnapshot().questionSetId).toBe('canada');
    expect(engine.getSnapshot().questionSetIds).toEqual(['canada']);
    expect(engine.getSnapshot().totalQuestions).toBe(1);

    engine.join('Buddy', 's1');
    engine.start();
    expect(engine.setQuestions(['dog-facts'], next).ok).toBe(false);
  });

  it('rejects pause during answering and accepts on leaderboard', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    engine.start();
    expect(engine.pause().ok).toBe(false);

    vi.advanceTimersByTime(30_000 + REVEAL_DURATION_MS);
    expect(engine.getPhase()).toBe('leaderboard');
    expect(engine.pause().ok).toBe(true);
    expect(engine.getStatus()).toBe('paused');

    vi.advanceTimersByTime(60_000);
    expect(engine.getStatus()).toBe('paused');
    expect(engine.getPhase()).toBe('leaderboard');

    expect(engine.resume().ok).toBe(true);
    expect(engine.getPhase()).toBe('answering');
  });

  it('allows late join with remaining time only', () => {
    const engine = createEngine();
    engine.join('Early', 's1');
    engine.start();

    vi.advanceTimersByTime(10_000);
    const late = engine.join('Late', 's2');
    expect(late.ok).toBe(true);
    if (!late.ok) return;

    const remaining = engine.getRemainingMs();
    expect(remaining).toBeLessThanOrEqual(20_000);
    expect(remaining).toBeGreaterThan(0);

    const result = engine.submitAnswer(late.player.id, 'b');
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate names case-insensitively', () => {
    const engine = createEngine();
    expect(engine.join('Buddy', 's1').ok).toBe(true);
    expect(engine.join('buddy', 's2').ok).toBe(false);
  });

  it('hides correct answers from player snapshots until reveal', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    engine.start();
    const answering = engine.getSnapshot('player');
    expect(answering.currentQuestion?.answers.every((a) => a.correct === undefined)).toBe(
      true
    );

    vi.advanceTimersByTime(30_000);
    const reveal = engine.getSnapshot('player');
    expect(reveal.currentQuestion?.answers.some((a) => a.correct === true)).toBe(
      true
    );
  });

  it('finishes after the last question leaderboard', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    engine.start();
    const cycle = 30_000 + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS;
    vi.advanceTimersByTime(cycle);
    vi.advanceTimersByTime(cycle);
    expect(engine.getStatus()).toBe('finished');
  });

  it('kicks a player', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    if (!join.ok) return;
    const kicked = engine.kick(join.player.id);
    expect(kicked.ok).toBe(true);
    expect(engine.getPlayer(join.player.id)).toBeUndefined();
  });

  it('reveals as soon as kicking the last unanswered player', () => {
    const engine = createEngine();
    const a = engine.join('Ada', 's1');
    const b = engine.join('Bea', 's2');
    if (!a.ok || !b.ok) return;
    engine.start();
    engine.submitAnswer(a.player.id, 'b');
    expect(engine.getPhase()).toBe('answering');
    expect(engine.kick(b.player.id).ok).toBe(true);
    expect(engine.getPhase()).toBe('reveal');
    expect(engine.getPlayer(a.player.id)?.score).toBeGreaterThan(0);
    expect(engine.getPlayer(b.player.id)).toBeUndefined();
  });

  it('advances early when all connected players answer', () => {
    const engine = createEngine();
    const a = engine.join('A', 's1');
    const b = engine.join('B', 's2');
    if (!a.ok || !b.ok) return;
    engine.start();
    engine.submitAnswer(a.player.id, 'b');
    expect(engine.getPhase()).toBe('answering');
    expect(engine.getPlayer(a.player.id)?.score).toBe(0);
    engine.submitAnswer(b.player.id, 'a');
    expect(engine.getPhase()).toBe('reveal');
    expect(engine.getPlayer(a.player.id)?.score).toBeGreaterThan(0);
  });

  it('preserves score when a disconnected player rejoins', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    engine.start();
    expect(engine.submitAnswer(join.player.id, 'b').ok).toBe(true);
    const score = engine.getPlayer(join.player.id)!.score;
    expect(score).toBeGreaterThan(0);

    engine.markDisconnected('s1');
    expect(engine.getPlayer(join.player.id)?.connected).toBe(false);

    const rejoin = engine.join('Buddy', 's2', join.player.id);
    expect(rejoin.ok).toBe(true);
    if (!rejoin.ok) return;
    expect(rejoin.player.score).toBe(score);
    expect(rejoin.player.connected).toBe(true);
  });

  it('rejects a second live connection with the same name', () => {
    const engine = createEngine();
    expect(engine.join('Buddy', 's1').ok).toBe(true);
    expect(engine.join('Buddy', 's2').ok).toBe(false);
  });

  it('takes over an existing session and reports the replaced socket', () => {
    const engine = createEngine();
    const join = engine.join('Buddy', 's1');
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    const takeover = engine.join('Buddy', 's2', join.player.id);
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.replacedSocketId).toBe('s1');
    expect(engine.getPlayer(join.player.id)?.socketId).toBe('s2');
  });

  it('schedules a delayed start', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    expect(engine.start({ delayMinutes: 1 }).ok).toBe(true);
    expect(engine.getStatus()).toBe('waiting');
    expect(engine.getSnapshot().scheduledStartAt).not.toBeNull();

    vi.advanceTimersByTime(60_000);
    expect(engine.getStatus()).toBe('active');
    expect(engine.getSnapshot().scheduledStartAt).toBeNull();
  });

  it('uses configurable reveal and leaderboard durations', () => {
    const engine = createEngine();
    engine.join('Buddy', 's1');
    expect(
      engine.updateConfig({
        timeLimitSeconds: 30,
        defaultScore: 1000,
        minScore: 100,
        scaleMs: 100,
        revealDurationMs: 1_000,
        leaderboardDurationMs: 1_500,
      }).ok
    ).toBe(true);

    engine.start();
    vi.advanceTimersByTime(30_000);
    expect(engine.getPhase()).toBe('reveal');
    vi.advanceTimersByTime(999);
    expect(engine.getPhase()).toBe('reveal');
    vi.advanceTimersByTime(1);
    expect(engine.getPhase()).toBe('leaderboard');
    vi.advanceTimersByTime(1_499);
    expect(engine.getPhase()).toBe('leaderboard');
    vi.advanceTimersByTime(1);
    expect(engine.getPhase()).toBe('answering');
  });

  it('concatenates continuous question sets and keeps a running score', () => {
    const engine = createEngine();
    const extra: Question = {
      id: 'pack2:q1',
      question: 'Extra?',
      answers: [
        { id: 'a', text: 'A', correct: true },
        { id: 'b', text: 'B', correct: false },
        { id: 'c', text: 'C', correct: false },
        { id: 'd', text: 'D', correct: false },
      ],
    };
    expect(
      engine.setQuestions(
        ['dog-facts', 'cat-facts'],
        [...questions, extra],
        'continuous'
      ).ok
    ).toBe(true);
    expect(engine.getSnapshot().totalQuestions).toBe(3);
    expect(engine.getSnapshot().questionSetMode).toBe('continuous');
  });
});
