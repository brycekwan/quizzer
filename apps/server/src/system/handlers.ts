import type { Server, Socket } from 'socket.io';
import { SYSTEM_REMOVAL_REASON } from '@party/shared';
import type { SystemAdmin } from './SystemAdmin';

export function registerSystemHandlers(io: Server, admin: SystemAdmin): void {
  const broadcast = () => {
    const snapshot = admin.getSnapshot();
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.systemAdmin) {
        socket.emit('system:admin:state', snapshot);
      }
    }
  };

  admin.onChange(broadcast);

  io.on('connection', (socket: Socket) => {
    socket.on(
      'system:admin:subscribe',
      (_payload: unknown, ack?: (result: unknown) => void) => {
        socket.data.systemAdmin = true;
        ack?.({ ok: true });
        socket.emit('system:admin:state', admin.getSnapshot());
      }
    );

    socket.on(
      'system:admin:kick',
      (
        payload: { playerId?: string },
        ack?: (result: unknown) => void
      ) => {
        const playerId = payload?.playerId?.trim();
        if (!playerId) {
          ack?.({ ok: false, error: 'Choose a player' });
          return;
        }
        const result = admin.removePlayer(playerId);
        if (!result.ok) {
          ack?.(result);
          return;
        }
        if (result.socketId) {
          const target = io.sockets.sockets.get(result.socketId);
          if (target) {
            delete target.data.playerId;
            delete target.data.inQuizzer;
            delete target.data.crosswordPlayer;
            delete target.data.wordsearchPlayer;
            target.emit('player:kicked', { reason: SYSTEM_REMOVAL_REASON });
            target.disconnect(true);
          }
        }
        ack?.({ ok: true });
      }
    );

    socket.on('disconnect', () => {
      delete socket.data.systemAdmin;
    });
  });
}
