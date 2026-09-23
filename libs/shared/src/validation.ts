import type { GameConfig, Question, QuestionsFile } from './types';
import {
  MAX_LEADERBOARD_DURATION_MS,
  MAX_REVEAL_DURATION_MS,
  MIN_LEADERBOARD_DURATION_MS,
  MIN_REVEAL_DURATION_MS,
  MIN_TIME_LIMIT_SECONDS,
} from './types';

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateGameConfig(
  config: Partial<GameConfig>
): { ok: true; config: GameConfig } | { ok: false; error: string } {
  const timeLimitSeconds = config.timeLimitSeconds;
  const defaultScore = config.defaultScore;
  const minScore = config.minScore;
  const scaleMs = config.scaleMs;
  const revealDurationMs = config.revealDurationMs;
  const leaderboardDurationMs = config.leaderboardDurationMs;

  if (
    typeof timeLimitSeconds !== 'number' ||
    !Number.isFinite(timeLimitSeconds) ||
    timeLimitSeconds < MIN_TIME_LIMIT_SECONDS
  ) {
    return {
      ok: false,
      error: `timeLimitSeconds must be at least ${MIN_TIME_LIMIT_SECONDS}`,
    };
  }

  if (!isNonNegativeFinite(defaultScore)) {
    return { ok: false, error: 'defaultScore must be a non-negative number' };
  }

  if (!isNonNegativeFinite(minScore)) {
    return { ok: false, error: 'minScore must be a non-negative number' };
  }

  if (minScore > defaultScore) {
    return { ok: false, error: 'minScore cannot exceed defaultScore' };
  }

  if (!isPositiveFinite(scaleMs)) {
    return { ok: false, error: 'scaleMs must be a positive number (milliseconds)' };
  }

  if (
    typeof revealDurationMs !== 'number' ||
    !Number.isFinite(revealDurationMs) ||
    revealDurationMs < MIN_REVEAL_DURATION_MS ||
    revealDurationMs > MAX_REVEAL_DURATION_MS
  ) {
    return {
      ok: false,
      error: `revealDurationMs must be between ${MIN_REVEAL_DURATION_MS} and ${MAX_REVEAL_DURATION_MS}`,
    };
  }

  if (
    typeof leaderboardDurationMs !== 'number' ||
    !Number.isFinite(leaderboardDurationMs) ||
    leaderboardDurationMs < MIN_LEADERBOARD_DURATION_MS ||
    leaderboardDurationMs > MAX_LEADERBOARD_DURATION_MS
  ) {
    return {
      ok: false,
      error: `leaderboardDurationMs must be between ${MIN_LEADERBOARD_DURATION_MS} and ${MAX_LEADERBOARD_DURATION_MS}`,
    };
  }

  return {
    ok: true,
    config: {
      timeLimitSeconds,
      defaultScore,
      minScore,
      scaleMs,
      revealDurationMs,
      leaderboardDurationMs,
    },
  };
}

export function validateQuestion(question: Question, index: number): string | null {
  if (!question.id?.trim()) {
    return `Question at index ${index} is missing id`;
  }
  if (!question.question?.trim()) {
    return `Question ${question.id} is missing question text`;
  }
  if (!Array.isArray(question.answers) || question.answers.length !== 4) {
    return `Question ${question.id} must have exactly 4 answers`;
  }

  const correctCount = question.answers.filter((a) => a.correct).length;
  if (correctCount !== 1) {
    return `Question ${question.id} must have exactly one correct answer`;
  }

  for (const answer of question.answers) {
    if (!answer.id?.trim() || !answer.text?.trim()) {
      return `Question ${question.id} has an invalid answer`;
    }
  }

  if (
    question.score !== undefined &&
    (typeof question.score !== 'number' ||
      !Number.isFinite(question.score) ||
      question.score <= 0)
  ) {
    return `Question ${question.id} score must be a positive number when provided`;
  }

  if (
    question.multiplier !== undefined &&
    (typeof question.multiplier !== 'number' ||
      !Number.isFinite(question.multiplier) ||
      question.multiplier <= 1)
  ) {
    return `Question ${question.id} multiplier must be a number greater than 1 when provided`;
  }

  return null;
}

export function validateQuestionsFile(file: QuestionsFile): string | null {
  if (!file?.questions || !Array.isArray(file.questions) || file.questions.length === 0) {
    return 'Questions file must contain a non-empty questions array';
  }

  for (let i = 0; i < file.questions.length; i++) {
    const err = validateQuestion(file.questions[i], i);
    if (err) {
      return err;
    }
  }

  return null;
}
