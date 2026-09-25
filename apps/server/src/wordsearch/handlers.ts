import type { Server, Socket } from 'socket.io';
import type { SessionRegistry } from '../session/SessionRegistry';
import { WordSearchEngine } from './WordSearchEngine';
import { loadWordSearchPuzzle } from './loadPuzzle';

export function registerWordSearchHandlers(
  io: Server,
  engine: WordSearchEngine,
  sessions: SessionRegistry
): void {
  const playerSnapshot = (socket: Socket) => {
    const playerId = socket.data.playerId as string | undefined;
    if (!playerId) {
      return null;
    }
    return engine.getPlayerSnapshot(playerId);
  };

  const broadcastPlayers = () => {
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.data.wordsearchPlayer) {
        continue;
      }
      const snapshot = playerSnapshot(socket);
      if (snapshot) {
        socket.emit('wordsearch:state', snapshot);
      }
    }
  };

  const broadcastAdmins = () => {
    const snapshot = engine.getAdminSnapshot();
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.wordsearchAdmin) {
        socket.emit('wordsearch:admin:state', snapshot);
      }
    }
  };

  const broadcast = () => {
    broadcastPlayers();
    broadcastAdmins();
  };

  const resumeConnected = (playerId?: string) => {
    for (const socket of io.sockets.sockets.values()) {
      const id = socket.data.playerId as string | undefined;
      if (!socket.data.wordsearchPlayer || !id) {
        continue;
      }
      if (playerId && id !== playerId) {
        continue;
      }
      engine.resumeTimer(id);
    }
  };

  engine.onChange(broadcast);

  io.on('connection', (socket: Socket) => {
    socket.on(
      'wordsearch:subscribe',
      (_payload: unknown, ack?: (result: unknown) => void) => {
        const playerId = socket.data.playerId as string | undefined;
        if (!playerId) {
          ack?.({ ok: false, error: 'Log in first' });
          return;
        }
        const session = sessions.get(playerId);
        if (!session) {
          ack?.({ ok: false, error: 'Log in first' });
          return;
        }
        engine.ensurePlayer(playerId, session.name);
        socket.data.wordsearchPlayer = true;
        engine.resumeTimer(playerId);
        ack?.({ ok: true });
        const snapshot = engine.getPlayerSnapshot(playerId);
        if (snapshot) {
          socket.emit('wordsearch:state', snapshot);
        }
      }
    );

    socket.on(
      'wordsearch:submitSelection',
      (
        payload: { cells?: { row: number; col: number }[] },
        ack?: (result: unknown) => void
      ) => {
        const playerId = socket.data.playerId as string | undefined;
        if (!playerId || !socket.data.wordsearchPlayer) {
          ack?.({ ok: false, error: 'Log in first' });
          return;
        }
        ack?.(engine.submitSelection(playerId, payload?.cells ?? []));
      }
    );

    socket.on(
      'wordsearch:admin:subscribe',
      (_payload: unknown, ack?: (result: unknown) => void) => {
        socket.data.wordsearchAdmin = true;
        ack?.({ ok: true });
        socket.emit('wordsearch:admin:state', engine.getAdminSnapshot());
      }
    );

    socket.on(
      'wordsearch:admin:selectPuzzle',
      (
        payload: { puzzleId?: string },
        ack?: (result: unknown) => void
      ) => {
        const puzzleId = payload?.puzzleId?.trim();
        if (!puzzleId) {
          ack?.({ ok: false, error: 'Select a word search' });
          return;
        }
        ack?.(engine.selectPuzzle(puzzleId));
      }
    );

    socket.on(
      'wordsearch:admin:reset',
      (_payload: unknown, ack?: (result: unknown) => void) => {
        const pendingId = engine.getPendingPuzzleId();
        if (pendingId !== engine.activePuzzleId) {
          const loaded = loadWordSearchPuzzle(pendingId);
          if (!loaded.ok) {
            ack?.(loaded);
            return;
          }
          engine.setPuzzle(loaded.puzzle, loaded.words);
        }
        const result = engine.reset();
        resumeConnected();
        ack?.(result);
      }
    );

    socket.on(
      'wordsearch:admin:resetPlayer',
      (
        payload: { playerId?: string },
        ack?: (result: unknown) => void
      ) => {
        const playerId = payload?.playerId?.trim();
        if (!playerId) {
          ack?.({ ok: false, error: 'Choose a player' });
          return;
        }
        const result = engine.resetPlayer(playerId);
        if (result.ok) {
          resumeConnected(playerId);
        }
        ack?.(result);
      }
    );

    socket.on('disconnect', () => {
      const playerId = socket.data.playerId as string | undefined;
      if (socket.data.wordsearchPlayer && playerId) {
        engine.pauseTimer(playerId);
      }
      delete socket.data.wordsearchPlayer;
      delete socket.data.wordsearchAdmin;
    });
  });
}
