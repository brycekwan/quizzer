import { describe, expect, it } from 'vitest';
import {
  validateGameConfig,
  validateQuestionsFile,
} from './validation';
import questionsData from './questions.json';
import type { Question } from './types';

describe('validateGameConfig', () => {
  it('accepts a valid config', () => {
    const result = validateGameConfig({
      timeLimitSeconds: 10,
      defaultScore: 1000,
      minScore: 100,
      scaleMs: 100,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects timeLimitSeconds below 10', () => {
    const result = validateGameConfig({
      timeLimitSeconds: 9,
      defaultScore: 1000,
      minScore: 100,
      scaleMs: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least 10/);
    }
  });

  it('rejects minScore greater than defaultScore', () => {
    const result = validateGameConfig({
      timeLimitSeconds: 30,
      defaultScore: 100,
      minScore: 200,
      scaleMs: 100,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-positive scaleMs', () => {
    const result = validateGameConfig({
      timeLimitSeconds: 30,
      defaultScore: 1000,
      minScore: 100,
      scaleMs: 0,
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateQuestionsFile', () => {
  it('validates the seed dog-fact questions', () => {
    expect(validateQuestionsFile(questionsData)).toBeNull();
    expect(questionsData.questions).toHaveLength(10);
    expect(questionsData.questions[2].multiplier).toBe(2);
    expect(questionsData.questions[5].multiplier).toBe(3);
  });

  it('requires exactly 4 answers and one correct', () => {
    const bad: Question = {
      id: 'x',
      question: 'Test?',
      answers: [
        { id: 'a', text: 'A', correct: true },
        { id: 'b', text: 'B', correct: true },
        { id: 'c', text: 'C', correct: false },
        { id: 'd', text: 'D', correct: false },
      ],
    };
    expect(
      validateQuestionsFile({ questions: [bad] })
    ).toMatch(/exactly one correct/);
  });

  it('rejects invalid multipliers', () => {
    const bad: Question = {
      id: 'x',
      question: 'Test?',
      answers: [
        { id: 'a', text: 'A', correct: true },
        { id: 'b', text: 'B', correct: false },
        { id: 'c', text: 'C', correct: false },
        { id: 'd', text: 'D', correct: false },
      ],
      multiplier: 1,
    };
    expect(validateQuestionsFile({ questions: [bad] })).toMatch(/multiplier/);
  });
});
