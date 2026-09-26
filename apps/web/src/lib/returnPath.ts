const PLAYER_PATHS = new Set(['/', '/quizzer', '/crossword', '/wordsearch']);

/** Where a successful login should continue. Direct visits to login go to the lobby. */
export function returnPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  if (next === '/play') {
    return '/quizzer';
  }
  if (next && PLAYER_PATHS.has(next)) {
    return next;
  }
  return '/';
}

export function loginRedirect(pathname: string): string {
  const next = pathname === '/play' ? '/quizzer' : pathname;
  if (!PLAYER_PATHS.has(next)) {
    return '/login';
  }
  return `/login?next=${encodeURIComponent(next)}`;
}
