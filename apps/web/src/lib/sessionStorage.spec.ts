import { beforeEach, describe, expect, it } from 'vitest';
import { APP_BUILD_ID } from './buildId';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from './sessionStorage';

describe('stored session', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a login saved for the current build', () => {
    writeStoredSession('p_12345678', 'Maple');
    expect(readStoredSession()).toEqual({
      playerId: 'p_12345678',
      playerName: 'Maple',
    });
    expect(localStorage.getItem('party.buildId')).toBe(APP_BUILD_ID);
  });

  it('drops a login saved by a previous build', () => {
    localStorage.setItem('party.buildId', 'older-release');
    localStorage.setItem('party.playerId', 'p_12345678');
    localStorage.setItem('party.playerName', 'Maple');
    localStorage.setItem('quizzer.playerId', 'p_legacy12');
    localStorage.setItem('quizzer.playerName', 'Scout');

    expect(readStoredSession()).toEqual({ playerId: null, playerName: null });
    expect(localStorage.getItem('party.playerId')).toBeNull();
    expect(localStorage.getItem('party.playerName')).toBeNull();
    expect(localStorage.getItem('quizzer.playerId')).toBeNull();
    expect(localStorage.getItem('quizzer.playerName')).toBeNull();
    expect(localStorage.getItem('party.buildId')).toBe(APP_BUILD_ID);
  });

  it('does not revive a legacy quizzer login after this build', () => {
    localStorage.setItem('quizzer.playerId', 'p_legacy12');
    localStorage.setItem('quizzer.playerName', 'Scout');

    expect(readStoredSession()).toEqual({ playerId: null, playerName: null });
    expect(localStorage.getItem('quizzer.playerName')).toBeNull();
  });

  it('still migrates a legacy login recorded for this build', () => {
    localStorage.setItem('party.buildId', APP_BUILD_ID);
    localStorage.setItem('quizzer.playerId', 'p_legacy12');
    localStorage.setItem('quizzer.playerName', 'Scout');

    expect(readStoredSession()).toEqual({
      playerId: 'p_legacy12',
      playerName: 'Scout',
    });
    expect(localStorage.getItem('party.playerName')).toBe('Scout');
  });

  it('clears the stored player without a new login', () => {
    writeStoredSession('p_12345678', 'Maple');
    clearStoredSession();
    expect(readStoredSession()).toEqual({ playerId: null, playerName: null });
  });
});
