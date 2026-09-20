import type { Server, Socket } from 'socket.io';
import type { GameConfig } from '@quizzer/shared';
import { GameEngine } from '../game/GameEngine';

export function registerSocketHandlers(io: Server, engine: GameEngine): void {
  const snapshotFor = (socket: Socket) => {
    const role = (socket.data.role as 'player' | 'admin') ?? 'player';
    const playerId = socket.data.playerId as string | undefined;
    return engine.getSnapshot(role, playerId);
  };

  const broadcast = () => {
    for (const socket of io.sockets.sockets.values()) {
      socket.emit('game:state', snapshotFor(socket));
    }
  };

  engine.onChange(broadcast);

  io.on('connection', (socket: Socket) => {
    socket.data.role = 'player';

    socket.emit('game:state', snapshotFor(socket));

    socket.on('admin:subscribe', () => {
      socket.data.role = 'admin';
      socket.emit('game:state', snapshotFor(socket));
    });

    socket.on(
      'player:join',
      (
        payload: { name: string; playerId?: string },
        ack?: (result: unknown) => void
      ) => {
        const result = engine.join(
          payload?.name ?? '',
          socket.id,
          payload?.playerId
        );
        if (result.ok) {
          socket.data.playerId = result.player.id;
          socket.data.role = 'player';
          ack?.({
            ok: true,
            playerId: result.player.id,
            name: result.player.name,
          });
          socket.emit('game:state', snapshotFor(socket));
        } else {
          ack?.({ ok: false, error: result.error });
        }
      }
    );

    socket.on(
      'player:answer',
      (
        payload: { answerId: string; playerId?: string },
        ack?: (result: unknown) => void
      ) => {
        const playerId =
          (socket.data.playerId as string | undefined) ?? payload?.playerId;
        if (!playerId) {
          ack?.({ ok: false, error: 'Join the game first' });
          return;
        }
        socket.data.playerId = playerId;
        const result = engine.submitAnswer(playerId, payload?.answerId);
        ack?.(result);
      }
    );

    socket.on('admin:start', (_payload: unknown, ack?: (result: unknown) => void) => {
      ack?.(engine.start());
    });

    socket.on('admin:pause', (_payload: unknown, ack?: (result: unknown) => void) => {
      ack?.(engine.pause());
    });

    socket.on('admin:resume', (_payload: unknown, ack?: (result: unknown) => void) => {
      ack?.(engine.resume());
    });

    socket.on('admin:reset', (_payload: unknown, ack?: (result: unknown) => void) => {
      ack?.(engine.reset());
    });

    socket.on(
      'admin:config',
      (payload: Partial<GameConfig>, ack?: (result: unknown) => void) => {
        ack?.(engine.updateConfig(payload ?? {}));
      }
    );

    socket.on(
      'admin:kick',
      (
        payload: { playerId: string },
        ack?: (result: unknown) => void
      ) => {
        const result = engine.kick(payload?.playerId);
        if (result.ok && result.socketId) {
          const target = io.sockets.sockets.get(result.socketId);
          target?.emit('player:kicked', { reason: 'Removed by admin' });
          target?.disconnect(true);
        }
        ack?.(result);
      }
    );

    socket.on('disconnect', () => {
      engine.markDisconnected(socket.id);
    });
  });
}
