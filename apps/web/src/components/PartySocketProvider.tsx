import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import {
  attachPartySocketLifecycle,
  getPartySocket,
} from '@/lib/partySocket';

type PartySocketContextValue = {
  socket: Socket;
  connected: boolean;
};

const PartySocketContext = createContext<PartySocketContextValue | null>(null);

export function PartySocketProvider({ children }: { children: ReactNode }) {
  const [socket] = useState(() => getPartySocket());
  const [connected, setConnected] = useState(() => socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);
    const detachLifecycle = attachPartySocketLifecycle(socket);

    return () => {
      detachLifecycle();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return (
    <PartySocketContext.Provider value={{ socket, connected }}>
      {children}
    </PartySocketContext.Provider>
  );
}

export function usePartySocket(): PartySocketContextValue {
  const value = useContext(PartySocketContext);
  if (!value) {
    throw new Error('usePartySocket must be used within PartySocketProvider');
  }
  return value;
}
