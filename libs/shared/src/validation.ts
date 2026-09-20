import type { GameConfig, Question, QuestionsFile } from './types';
import { MIN_TIME_LIMIT_SECONDS } from './types';

export function validateGameConfig(
  config: Partial<GameConfig>
): { ok: true; config: GameConfig } | { ok: false; error: string } {
  const timeLimitSeconds = config.timeLimitSeconds;
  const defaultScore = config.defaultScore;
  const minScore = config.minScore;
  const scaleMs = config.scaleMs;

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

  if (
    typeof defaultScore !== 'number' ||
    !Number.isFinite(defaultScore) ||
    defaultScore < 0
  ) {
    return { ok: false, error: 'defaultScore must be a non-negative number' };
  }

  if (
    typeof minScore !== 'number' ||
    !Number.isFinite(minScore) ||
    minScore < 0
  ) {
    return { ok: false, error: 'minScore must be a non-negative number' };
  }

  if (minScore > defaultScore) {
    return { ok: false, error: 'minScore cannot exceed defaultScore' };
  }

  if (typeof scaleMs !== 'number' || !Number.isFinite(scaleMs) || scaleMs <= 0) {
    return { ok: false, error: 'scaleMs must be a positive number (milliseconds)' };
  }

  return {
    ok: true,
    config: {
      timeLimitSeconds,
      defaultScore,
      minScore,
      scaleMs,
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
