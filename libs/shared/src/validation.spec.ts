import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  validateGameConfig,
  validateQuestionsFile,
} from './validation';
import type { Question, QuestionsFile } from './types';

const questionsDir = path.resolve(
  __dirname,
  '../../../apps/server/questions'
);

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
  it('validates every shipped question pack', () => {
    const files = fs
      .readdirSync(questionsDir)
      .filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(questionsDir, file), 'utf8')
      ) as QuestionsFile;
      expect(validateQuestionsFile(data), file).toBeNull();
      expect(data.questions.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('validates the seed dog-fact multipliers', () => {
    const questionsData = JSON.parse(
      fs.readFileSync(path.join(questionsDir, 'dog-facts.json'), 'utf8')
    ) as QuestionsFile;
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
