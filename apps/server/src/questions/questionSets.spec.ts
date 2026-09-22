import { describe, expect, it } from 'vitest';
import {
  labelFromQuestionSetId,
  listQuestionSets,
  loadQuestionSet,
  resolveQuestionsDir,
} from './questionSets';

describe('questionSets', () => {
  it('labels filenames as readable topics', () => {
    expect(labelFromQuestionSetId('dog-facts')).toBe('Dog Facts');
    expect(labelFromQuestionSetId('world-foods')).toBe('World Foods');
    expect(labelFromQuestionSetId('canada')).toBe('Canada');
  });

  it('lists JSON packs from the questions directory', () => {
    const sets = listQuestionSets(resolveQuestionsDir());
    const ids = sets.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'canada',
        'cat-facts',
        'dog-facts',
        'geography',
        'world-foods',
      ])
    );
    expect(sets.find((s) => s.id === 'cat-facts')?.label).toBe('Cat Facts');
  });

  it('loads and validates a question pack', () => {
    const loaded = loadQuestionSet('dog-facts');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.questions.length).toBeGreaterThan(0);
  });

  it('rejects unknown packs', () => {
    const loaded = loadQuestionSet('does-not-exist');
    expect(loaded.ok).toBe(false);
  });
});
