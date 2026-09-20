import type { GameConfig } from './types';

/**
 * Linear time-based score using scaleMs steps.
 * Correct answers only; callers should pass isCorrect=false for wrong answers.
 * Optional multiplier scales the final points for bonus questions.
 */
export function computeQuestionScore(params: {
  elapsedMs: number;
  timeLimitSeconds: number;
  scaleMs: number;
  baseScore: number;
  minScore: number;
  isCorrect: boolean;
  multiplier?: number;
}): number {
  const {
    elapsedMs,
    timeLimitSeconds,
    scaleMs,
    baseScore,
    minScore,
    isCorrect,
    multiplier = 1,
  } = params;

  if (!isCorrect) {
    return 0;
  }

  const factor =
    typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0
      ? multiplier
      : 1;

  let points: number;

  if (scaleMs <= 0 || timeLimitSeconds <= 0) {
    points = minScore;
  } else {
    const limitMs = timeLimitSeconds * 1000;
    const clamped = Math.min(Math.max(elapsedMs, 0), limitMs);
    const totalSteps = Math.floor(limitMs / scaleMs);

    if (totalSteps <= 0) {
      points = Math.max(minScore, baseScore);
    } else {
      const step = Math.floor(clamped / scaleMs);
      points = Math.round(
        baseScore - (step * (baseScore - minScore)) / totalSteps
      );
      points = Math.max(minScore, points);
    }
  }

  return Math.round(points * factor);
}

export function resolveBaseScore(
  questionScore: number | undefined,
  config: GameConfig
): number {
  return questionScore ?? config.defaultScore;
}
