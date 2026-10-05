/** True once the play clock has banked time, is running, or the puzzle is done. */
export function playHasStarted(state: {
  elapsedMs: number;
  activeSince: number | null;
  completed: boolean;
}): boolean {
  return state.completed || state.elapsedMs > 0 || state.activeSince != null;
}
