import { describe, expect, it } from 'vitest';
import { keyboardStates } from './wordSurvivor';

describe('keyboardStates', () => {
  it('keeps the strongest mark for a repeated letter', () => {
    expect(
      keyboardStates([
        { word: 'ZZZZZ', marks: ['absent', 'absent', 'absent', 'absent', 'absent'] },
        { word: 'CRANE', marks: ['correct', 'present', 'absent', 'absent', 'correct'] },
      ])
    ).toEqual({
      Z: 'absent',
      C: 'correct',
      R: 'present',
      A: 'absent',
      N: 'absent',
      E: 'correct',
    });
  });

  it('does not downgrade a green when the letter is later grey', () => {
    expect(
      keyboardStates([
        { word: 'CRANE', marks: ['correct', 'absent', 'absent', 'absent', 'absent'] },
        { word: 'CLOCK', marks: ['correct', 'absent', 'absent', 'absent', 'absent'] },
      ]).C
    ).toBe('correct');
  });
});
