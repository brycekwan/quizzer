import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CrosswordAdminSnapshot,
  CrosswordPlayerSnapshot,
} from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';
import { createSerialSender, emitInput, type InputAck } from '@/lib/optimisticInput';
import { usePartySocket } from '@/components/PartySocketProvider';
import { whenConnected } from '@/lib/partySocket';

type LetterAck = InputAck & { correctWordIds?: string[] };

export function useCrosswordSocket(
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
  const [playerState, setPlayerState] = useState<CrosswordPlayerSnapshot | null>(
    null
  );
  const [adminState, setAdminState] = useState<CrosswordAdminSnapshot | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [hostReady, setHostReady] = useState(role !== 'admin');
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  useEffect(() => {
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
            socket.emit('crossword:admin:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
              if (!active) {
                return;
              }
              if (result?.ok === false) {
                setHostReady(false);
                setError(result.error ?? 'Could not subscribe as crossword admin');
                return;
              }
              setError(null);
              setHostReady(true);
            });
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
          socket.emit('crossword:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
            if (!active) {
              return;
            }
            if (result?.ok === false) {
              setError(result.error ?? 'Could not join crossword');
            }
          });
        });
      }
    };

    const detachReady = whenConnected(socket, onReady);
    const onPlayerState = (snapshot: CrosswordPlayerSnapshot) => {
      setPlayerState(snapshot);
    };
    const onAdminState = (snapshot: CrosswordAdminSnapshot) => {
      setAdminState(snapshot);
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
    socket.on('crossword:state', onPlayerState);
    socket.on('crossword:admin:state', onAdminState);
    socket.on('player:kicked', onKicked);

    return () => {
      active = false;
      if (role === 'player') {
        socket.emit('crossword:pauseTimer', {});
      }
      detachReady();
      socket.off('crossword:state', onPlayerState);
      socket.off('crossword:admin:state', onAdminState);
      socket.off('player:kicked', onKicked);
    };
  }, [socket, role, hostSecret, hostAttempt]);

  const api = useMemo(() => {
    const send = createSerialSender();
    return {
      setLetter: (row: number, col: number, letter: string) =>
        send<LetterAck>((done) =>
          emitInput(socketRef.current, 'crossword:setLetter', { row, col, letter }, done)
        ),
      clearLetter: (row: number, col: number) =>
        send<LetterAck>((done) =>
          emitInput(socketRef.current, 'crossword:clearLetter', { row, col }, done)
        ),
      pauseTimer: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('crossword:pauseTimer', {}, resolve);
        }),
      resumeTimer: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('crossword:resumeTimer', {}, resolve);
        }),
      reset: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('crossword:admin:reset', {}, resolve);
        }),
      resetPlayer: (playerId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'crossword:admin:resetPlayer',
            { playerId },
            resolve
          );
        }),
      selectPuzzle: (puzzleId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'crossword:admin:selectPuzzle',
            { puzzleId },
            resolve
          );
        }),
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
