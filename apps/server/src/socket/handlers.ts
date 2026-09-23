import type { Server, Socket } from 'socket.io';
import type { GameConfig, QuestionSetMode } from '@quizzer/shared';
import { GameEngine } from '../game/GameEngine';
import {
  listQuestionSets,
  loadQuestionSetsInOrder,
} from '../questions/questionSets';

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

  const displaceSocket = (socketId: string | null | undefined) => {
    if (!socketId) {
      return;
    }
    const target = io.sockets.sockets.get(socketId);
    if (!target) {
      return;
    }
    delete target.data.playerId;
    target.emit('player:kicked', {
      reason: 'Signed in from another device',
    });
    target.disconnect(true);
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
          displaceSocket(result.replacedSocketId);
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

    socket.on(
      'admin:start',
      (
        payload: { delayMinutes?: number } | undefined,
        ack?: (result: unknown) => void
      ) => {
        ack?.(engine.start(payload ?? {}));
      }
    );

    socket.on('admin:pause', (_payload: unknown, ack?: (result: unknown) => void) => {
      ack?.(engine.pause());
    });

    socket.on('admin:resume', (_payload: unknown, ack?: (result: unknown) => void) => {
      ack?.(engine.resume());
    });

    socket.on('admin:reset', (_payload: unknown, ack?: (result: unknown) => void) => {
      const result = engine.reset();
      for (const socketId of result.socketIds) {
        const target = io.sockets.sockets.get(socketId);
        if (!target) {
          continue;
        }
        delete target.data.playerId;
        target.emit('game:reset', {
          reason: 'Game was reset — please sign in again',
        });
        target.disconnect(true);
      }
      ack?.(result);
    });

    socket.on(
      'admin:config',
      (payload: Partial<GameConfig>, ack?: (result: unknown) => void) => {
        ack?.(engine.updateConfig(payload ?? {}));
      }
    );

    socket.on(
      'admin:questionSet',
      (
        payload: {
          questionSetId?: string;
          questionSetIds?: string[];
          mode?: QuestionSetMode;
        },
        ack?: (result: unknown) => void
      ) => {
        const mode: QuestionSetMode =
          payload?.mode === 'continuous' ? 'continuous' : 'single';
        const ids =
          payload?.questionSetIds?.filter((id) => Boolean(id?.trim())) ??
          (payload?.questionSetId?.trim()
            ? [payload.questionSetId.trim()]
            : []);

        if (ids.length === 0) {
          ack?.({ ok: false, error: 'Select at least one question set' });
          return;
        }

        if (mode === 'single' && ids.length !== 1) {
          ack?.({
            ok: false,
            error: 'Single mode requires exactly one question set',
          });
          return;
        }

        // Refresh the dropdown list in case files were added on disk.
        engine.setQuestionSets(listQuestionSets());

        const loaded = loadQuestionSetsInOrder(ids);
        if (!loaded.ok) {
          ack?.(loaded);
          return;
        }

        ack?.(engine.setQuestions(ids, loaded.questions, mode));
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
