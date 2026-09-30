import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { WordSurvivorAdminSnapshot, WordSurvivorPlayerSnapshot } from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';

type Ack = { ok: boolean; error?: string; message?: string };

export function useWordSurvivorSocket(
  role: 'player' | 'admin' = 'player',
  hostSecret: string | null = null,
  hostAttempt = 0
) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [playerState, setPlayerState] = useState<WordSurvivorPlayerSnapshot | null>(null);
  const [adminState, setAdminState] = useState<WordSurvivorAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [hostReady, setHostReady] = useState(role !== 'admin');
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    let active = true;

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

    socket.on('connect', () => {
      setConnected(true);
      if (role === 'admin') {
        unlockHost(
          socket,
          hostSecret,
          () => {
            if (!active) {
              return;
            }
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
                  return;
                }
                setError(null);
                setHostReady(true);
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
            if (result?.ok === false) {
              setError(result.error ?? 'Could not join word survivor');
            }
          });
        });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('wordsurvivor:state', (snapshot: WordSurvivorPlayerSnapshot) => {
      setPlayerState(snapshot);
    });
    socket.on('wordsurvivor:admin:state', (snapshot: WordSurvivorAdminSnapshot) => {
      setAdminState(snapshot);
    });
    socket.on('player:kicked', (payload?: { reason?: string }) => {
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
    });

    return () => {
      active = false;
      if (role === 'player') {
        socket.emit('wordsurvivor:pauseTimer', {});
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, hostSecret, hostAttempt]);

  const api = useMemo(() => {
    const emit = (event: string, payload: unknown) =>
      new Promise<Ack>((resolve) => {
        socketRef.current?.emit(event, payload, resolve);
      });
    return {
      ackIntro: () => emit('wordsurvivor:ackIntro', {}),
      typeLetter: (letter: string) => emit('wordsurvivor:letter', { letter }),
      backspace: () => emit('wordsurvivor:backspace', {}),
      submit: () => emit('wordsurvivor:submit', {}),
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
    ...api,
  };
}
