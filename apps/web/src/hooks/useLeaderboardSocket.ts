import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { PartyLeaderboardSnapshot } from '@party/shared';
import { unlockHost } from '@/lib/hostSecret';

export function useLeaderboardSocket(host?: {
  secret: string | null;
  attempt: number;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [board, setBoard] = useState<PartyLeaderboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(host == null);

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit(
        'leaderboard:subscribe',
        {},
        (result: { ok?: boolean; error?: string }) => {
          if (result?.ok === false) {
            setError(result.error ?? 'Could not open the leaderboard');
            return;
          }
          setError(null);
        }
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      if (!host) {
        setHostReady(true);
        subscribe();
        return;
      }
      unlockHost(
        socket,
        host.secret,
        () => {
          setHostReady(true);
          subscribe();
        },
        (message) => {
          setHostReady(false);
          setError(message);
        }
      );
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('leaderboard:state', (snapshot: PartyLeaderboardSnapshot) => {
      setBoard(snapshot);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [host?.secret, host?.attempt]);

  return { connected, board, error, hostReady };
}
