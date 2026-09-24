import type { Server, Socket } from 'socket.io';
import type { SessionRegistry } from '../session/SessionRegistry';
import { CrosswordEngine } from './CrosswordEngine';

export function registerCrosswordHandlers(
  io: Server,
  engine: CrosswordEngine,
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
      if (!socket.data.crosswordPlayer) {
        continue;
      }
      const snapshot = playerSnapshot(socket);
      if (snapshot) {
        socket.emit('crossword:state', snapshot);
      }
    }
  };

  const broadcastAdmins = () => {
    const snapshot = engine.getAdminSnapshot();
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.crosswordAdmin) {
        socket.emit('crossword:admin:state', snapshot);
      }
    }
  };

  const broadcast = () => {
    broadcastPlayers();
    broadcastAdmins();
  };

  engine.onChange(broadcast);

  io.on('connection', (socket: Socket) => {
    socket.on('crossword:subscribe', (_payload: unknown, ack?: (result: unknown) => void) => {
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
      socket.data.crosswordPlayer = true;
      engine.resumeTimer(playerId);
      ack?.({ ok: true });
      const snapshot = engine.getPlayerSnapshot(playerId);
      if (snapshot) {
        socket.emit('crossword:state', snapshot);
      }
    });

    socket.on(
      'crossword:setLetter',
      (
        payload: { row: number; col: number; letter: string },
        ack?: (result: unknown) => void
      ) => {
        const playerId = socket.data.playerId as string | undefined;
        if (!playerId) {
          ack?.({ ok: false, error: 'Log in first' });
          return;
        }
        ack?.(
          engine.setLetter(
            playerId,
            payload?.row,
            payload?.col,
            payload?.letter ?? ''
          )
        );
      }
    );

    socket.on(
      'crossword:clearLetter',
      (
        payload: { row: number; col: number },
        ack?: (result: unknown) => void
      ) => {
        const playerId = socket.data.playerId as string | undefined;
        if (!playerId) {
          ack?.({ ok: false, error: 'Log in first' });
          return;
        }
        ack?.(engine.clearLetter(playerId, payload?.row, payload?.col));
      }
    );

    socket.on(
      'crossword:admin:subscribe',
      (_payload: unknown, ack?: (result: unknown) => void) => {
        socket.data.crosswordAdmin = true;
        ack?.({ ok: true });
        socket.emit('crossword:admin:state', engine.getAdminSnapshot());
      }
    );

    socket.on(
      'crossword:admin:reset',
      (_payload: unknown, ack?: (result: unknown) => void) => {
        const result = engine.reset();
        ack?.(result);
      }
    );

    socket.on('disconnect', () => {
      const playerId = socket.data.playerId as string | undefined;
      if (socket.data.crosswordPlayer && playerId) {
        engine.pauseTimer(playerId);
      }
      delete socket.data.crosswordPlayer;
      delete socket.data.crosswordAdmin;
    });
  });
}
