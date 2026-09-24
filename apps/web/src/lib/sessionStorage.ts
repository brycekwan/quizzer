const PLAYER_ID_KEY = 'party.playerId';
const PLAYER_NAME_KEY = 'party.playerName';

function migrateLegacyKeys(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!localStorage.getItem(PLAYER_ID_KEY)) {
    const legacyId = localStorage.getItem('quizzer.playerId');
    if (legacyId) {
      localStorage.setItem(PLAYER_ID_KEY, legacyId);
      localStorage.removeItem('quizzer.playerId');
    }
  }
  if (!localStorage.getItem(PLAYER_NAME_KEY)) {
    const legacyName = localStorage.getItem('quizzer.playerName');
    if (legacyName) {
      localStorage.setItem(PLAYER_NAME_KEY, legacyName);
      localStorage.removeItem('quizzer.playerName');
    }
  }
}

export function readStoredSession(): {
  playerId: string | null;
  playerName: string | null;
} {
  if (typeof window === 'undefined') {
    return { playerId: null, playerName: null };
  }
  migrateLegacyKeys();
  return {
    playerId: localStorage.getItem(PLAYER_ID_KEY),
    playerName: localStorage.getItem(PLAYER_NAME_KEY),
  };
}

export function writeStoredSession(playerId: string, playerName: string): void {
  localStorage.setItem(PLAYER_ID_KEY, playerId);
  localStorage.setItem(PLAYER_NAME_KEY, playerName);
}

export function clearStoredSession(): void {
  localStorage.removeItem(PLAYER_ID_KEY);
  localStorage.removeItem(PLAYER_NAME_KEY);
  localStorage.removeItem('quizzer.playerId');
  localStorage.removeItem('quizzer.playerName');
}
