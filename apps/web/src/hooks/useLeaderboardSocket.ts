import { useEffect, useState } from 'react';
import type { PartyLeaderboardSnapshot } from '@party/shared';
import { unlockHost } from '@/lib/hostSecret';
import { usePartySocket } from '@/components/PartySocketProvider';
import { whenConnected } from '@/lib/partySocket';

export function useLeaderboardSocket(host?: {
  secret: string | null;
  attempt: number;
}) {
  const { socket, connected } = usePartySocket();
  const [board, setBoard] = useState<PartyLeaderboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(host == null);

  useEffect(() => {
    let active = true;

    const subscribe = () => {
      socket.emit(
        'leaderboard:subscribe',
        {},
        (result: { ok?: boolean; error?: string }) => {
          if (!active) {
            return;
          }
          if (result?.ok === false) {
            setError(result.error ?? 'Could not open the leaderboard');
            return;
          }
          setError(null);
        }
      );
    };

    const onReady = () => {
      if (!host) {
        setHostReady(true);
        subscribe();
        return;
      }
      unlockHost(
        socket,
        host.secret,
        () => {
          if (!active) {
            return;
          }
          setError(null);
          setHostReady(true);
          subscribe();
        },
        (message) => {
          if (!active) {
            return;
          }
          setHostReady(false);
          setError(message);
        }
      );
    };

    const detachReady = whenConnected(socket, onReady);
    const onBoard = (snapshot: PartyLeaderboardSnapshot) => {
      setBoard(snapshot);
      if (host) {
        setHostReady(true);
      }
    };
    socket.on('leaderboard:state', onBoard);

    return () => {
      active = false;
      detachReady();
      socket.off('leaderboard:state', onBoard);
    };
  }, [socket, host?.secret, host?.attempt]);

  return { connected, board, error, hostReady };
}
