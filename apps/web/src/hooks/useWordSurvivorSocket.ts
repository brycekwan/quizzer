import { useEffect, useMemo, useRef, useState } from 'react';
import type { WordSurvivorAdminSnapshot, WordSurvivorPlayerSnapshot } from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';
import {
  DROPPED,
  createOptimisticQueue,
  emitInput,
  type InputAck,
  type OptimisticQueue,
} from '@/lib/optimisticInput';
import { usePartySocket } from '@/components/PartySocketProvider';
import { whenConnected } from '@/lib/partySocket';

type Ack = InputAck & { message?: string };

type SurvivorInput = { kind: 'letter'; letter: string } | { kind: 'backspace' } | { kind: 'submit' };

/** Typing and erasing follow the server's rules. A submit waits for the server's verdict. */
function applySurvivorInput(
  state: WordSurvivorPlayerSnapshot,
  input: SurvivorInput
): WordSurvivorPlayerSnapshot {
  if (state.phase !== 'playing') {
    return state;
  }
  if (input.kind === 'letter') {
    if (!/^[a-zA-Z]$/.test(input.letter) || state.draft.length >= state.length) {
      return state;
    }
    return { ...state, draft: state.draft + input.letter.toUpperCase() };
  }
  if (input.kind === 'backspace') {
    return { ...state, draft: state.draft.slice(0, -1) };
  }
  return state;
}

export function useWordSurvivorSocket(
  role: 'player' | 'admin' = 'player',
  hostSecret: string | null = null,
  hostAttempt = 0
) {
  const { socket, connected } = usePartySocket();
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [playerState, setPlayerState] = useState<WordSurvivorPlayerSnapshot | null>(null);
  const [adminState, setAdminState] = useState<WordSurvivorAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [hostReady, setHostReady] = useState(role !== 'admin');
  /** Counts successful subscribes, so the page can resume the clock after a reconnect. */
  const [subscription, setSubscription] = useState(0);
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const queueRef = useRef<OptimisticQueue<WordSurvivorPlayerSnapshot, SurvivorInput> | null>(
    null
  );
  if (!queueRef.current) {
    const queue = createOptimisticQueue<WordSurvivorPlayerSnapshot, SurvivorInput>({
      apply: applySurvivorInput,
      send: (input, done) => {
        const activeSocket = socketRef.current;
        if (input.kind === 'letter') {
          emitInput(activeSocket, 'wordsurvivor:letter', { letter: input.letter }, done);
        } else if (input.kind === 'backspace') {
          emitInput(activeSocket, 'wordsurvivor:backspace', {}, done);
        } else {
          emitInput(activeSocket, 'wordsurvivor:submit', {}, done);
        }
      },
      onChange: () => setPlayerState(queue.view()),
    });
    queueRef.current = queue;
  }

  useEffect(() => {
    let active = true;
    const queue = queueRef.current;
    queue?.reset();

    const clearSession = () => {
      clearStoredSession();
      setPlayerId(null);
      setPlayerName(null);
    };

    const ensureSession = (then: () => void) => {
      const id = playerIdRef.current;
      const name = playerNameRef.current;
      if (!id || !name) {
        return;
      }
      socket.emit(
        'session:login',
        { name, playerId: id },
        (result: {
          ok: boolean;
          playerId?: string;
          name?: string;
          error?: string;
        }) => {
          if (!active) {
            return;
          }
          if (!result.ok || !result.playerId || !result.name) {
            clearSession();
            setError(result.error ?? 'Session expired');
            return;
          }
          writeStoredSession(result.playerId, result.name);
          setPlayerId(result.playerId);
          setPlayerName(result.name);
          then();
        }
      );
    };

    const onReady = () => {
      if (role === 'admin') {
        unlockHost(
          socket,
          hostSecret,
          () => {
            if (!active) {
              return;
            }
            setError(null);
            setHostReady(true);
            socket.emit(
              'wordsurvivor:admin:subscribe',
              {},
              (result: { ok?: boolean; error?: string }) => {
                if (!active) {
                  return;
                }
                if (result?.ok === false) {
                  setHostReady(false);
                  setError(result.error ?? 'Could not subscribe as word survivor admin');
                }
              }
            );
          },
          (message) => {
            if (!active) {
              return;
            }
            setHostReady(false);
            setError(message);
          }
        );
      } else {
        ensureSession(() => {
          socket.emit('wordsurvivor:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
            if (!active) {
              return;
            }
            if (result?.ok === false) {
              setError(result.error ?? 'Could not join word survivor');
              return;
            }
            setSubscription((count) => count + 1);
          });
        });
      }
    };

    const detachReady = whenConnected(socket, onReady);
    const onDisconnect = () => {
      queue?.reset();
    };
    const onPlayerState = (snapshot: WordSurvivorPlayerSnapshot) => {
      queue?.receive(snapshot);
    };
    const onAdminState = (snapshot: WordSurvivorAdminSnapshot) => {
      setAdminState(snapshot);
      setHostReady(true);
    };
    const onKicked = (payload?: { reason?: string }) => {
      if (!active) {
        return;
      }
      if (isSystemRemoval(payload)) {
        noteSystemRemoval();
        setPlayerId(null);
        setPlayerName(null);
        return;
      }
      if (isQuizRemoval(payload)) {
        return;
      }
      setKicked(true);
      clearSession();
    };
    socket.on('disconnect', onDisconnect);
    socket.on('wordsurvivor:state', onPlayerState);
    socket.on('wordsurvivor:admin:state', onAdminState);
    socket.on('player:kicked', onKicked);

    return () => {
      active = false;
      if (role === 'player') {
        socket.emit('wordsurvivor:pauseTimer', {});
      }
      detachReady();
      socket.off('disconnect', onDisconnect);
      socket.off('wordsurvivor:state', onPlayerState);
      socket.off('wordsurvivor:admin:state', onAdminState);
      socket.off('player:kicked', onKicked);
    };
  }, [socket, role, hostSecret, hostAttempt]);

  const api = useMemo(() => {
    const emit = (event: string, payload: unknown) =>
      new Promise<Ack>((resolve) => {
        socketRef.current?.emit(event, payload, resolve);
      });
    const queue = queueRef.current;
    const input = (next: SurvivorInput): Promise<Ack> => {
      // Letters after Enter belong to the next row, which only the server's verdict reveals.
      if (!queue || queue.pending().some((entry) => entry.kind === 'submit')) {
        return Promise.resolve(DROPPED);
      }
      return queue.push(next);
    };
    return {
      ackIntro: () => emit('wordsurvivor:ackIntro', {}),
      typeLetter: (letter: string) => input({ kind: 'letter', letter }),
      backspace: () => input({ kind: 'backspace' }),
      submit: () => input({ kind: 'submit' }),
      pauseTimer: () => emit('wordsurvivor:pauseTimer', {}),
      resumeTimer: () => emit('wordsurvivor:resumeTimer', {}),
      reset: () => emit('wordsurvivor:admin:reset', {}),
      resetPlayer: (id: string) => emit('wordsurvivor:admin:resetPlayer', { playerId: id }),
      setSplash: (seconds: number) => emit('wordsurvivor:admin:setSplash', { seconds }),
      selectList: (fileId: string, topic: string) =>
        emit('wordsurvivor:admin:select', { fileId, topic }),
    };
  }, []);

  return {
    connected,
    playerId,
    playerName,
    playerState,
    adminState,
    error,
    kicked,
    setError,
    hostReady,
    subscription,
    ...api,
  };
}
