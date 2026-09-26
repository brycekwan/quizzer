import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import {
  clearSystemRemovalMessage,
  isSystemRemoval,
  noteSystemRemoval,
} from '@/lib/systemRemoval';

type LoginResult =
  | { ok: true; playerId: string; name: string }
  | { ok: false; error: string };

export function useSession() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [kicked, setKicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    const rejoinIfNeeded = () => {
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
          if (result.ok && result.playerId && result.name) {
            writeStoredSession(result.playerId, result.name);
            setPlayerId(result.playerId);
            setPlayerName(result.name);
            setError(null);
          } else {
            clearSession();
            if (result.error) {
              setError(result.error);
            }
          }
        }
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      rejoinIfNeeded();
    });
    socket.on('disconnect', () => setConnected(false));
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const api = useMemo(
    () => ({
      login: (name: string) =>
        new Promise<LoginResult>((resolve) => {
          socketRef.current?.emit(
            'session:login',
            { name, playerId: playerIdRef.current ?? undefined },
            (result: {
              ok: boolean;
              playerId?: string;
              name?: string;
              error?: string;
            }) => {
              if (result.ok && result.playerId && result.name) {
                writeStoredSession(result.playerId, result.name);
                clearSystemRemovalMessage();
                setPlayerId(result.playerId);
                setPlayerName(result.name);
                setKicked(false);
                setError(null);
                resolve({
                  ok: true,
                  playerId: result.playerId,
                  name: result.name,
                });
              } else {
                const message = result.error ?? 'Could not log in';
                setError(message);
                resolve({ ok: false, error: message });
              }
            }
          );
        }),
      logout: () => {
        clearStoredSession();
        setPlayerId(null);
        setPlayerName(null);
      },
    }),
    []
  );

  return {
    connected,
    playerId,
    playerName,
    kicked,
    error,
    setError,
    ...api,
  };
}
