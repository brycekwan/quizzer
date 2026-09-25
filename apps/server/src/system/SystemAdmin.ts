import {
  buildSystemLeaderboard,
  type SystemAdminSnapshot,
} from '@party/shared';
import type { CrosswordEngine } from '../crossword/CrosswordEngine';
import type { GameEngine } from '../quizzer/game/GameEngine';
import type { SessionRegistry } from '../session/SessionRegistry';
import type { WordSearchEngine } from '../wordsearch/WordSearchEngine';

type Listener = () => void;

export class SystemAdmin {
  constructor(
    private readonly sessions: SessionRegistry,
    private readonly quiz: GameEngine,
    private readonly crossword: CrosswordEngine,
    private readonly wordSearch: WordSearchEngine
  ) {}

  onChange(listener: Listener): () => void {
    const unsubscribe = [
      this.sessions.onChange(listener),
      this.quiz.onChange(listener),
      this.crossword.onChange(listener),
      this.wordSearch.onChange(listener),
    ];
    return () => {
      for (const stop of unsubscribe) {
        stop();
      }
    };
  }

  getSnapshot(): SystemAdminSnapshot {
    const crosswordScores = new Map(
      this.crossword
        .getAdminSnapshot()
        .players.map((player) => [player.playerId, player.score])
    );
    const wordSearchScores = new Map(
      this.wordSearch
        .getAdminSnapshot()
        .players.map((player) => [player.playerId, player.score])
    );

    return buildSystemLeaderboard(
      this.sessions.list().map((session) => {
        const quizPlayer = this.quiz.getPlayer(session.id);
        return {
          playerId: session.id,
          name: session.name,
          connected: session.connected,
          crosswordScore: crosswordScores.has(session.id)
            ? (crosswordScores.get(session.id) ?? null)
            : null,
          wordSearchScore: wordSearchScores.has(session.id)
            ? (wordSearchScores.get(session.id) ?? null)
            : null,
          quizScore: quizPlayer ? quizPlayer.score : null,
        };
      })
    );
  }

  removePlayer(
    playerId: string
  ): { ok: true; socketId: string | null } | { ok: false; error: string } {
    const removed = this.sessions.remove(playerId);
    if (!removed.ok) {
      return removed;
    }
    this.quiz.kick(playerId);
    this.crossword.removePlayer(playerId);
    this.wordSearch.removePlayer(playerId);
    return { ok: true, socketId: removed.socketId };
  }
}
