import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

export const WEBSOCKET_FIRST = ['websocket', 'polling'] as const;
export const POLLING_FIRST = ['polling', 'websocket'] as const;

export type PartySocketOptions = Partial<ManagerOptions & SocketOptions>;

/** Shared Socket.IO options tuned for Safari/iOS WebSocket flakiness. */
export function createPartySocketOptions(): PartySocketOptions {
  return {
    path: '/socket.io',
    transports: [...WEBSOCKET_FIRST],
    tryAllTransports: true,
    autoConnect: true,
    reconnection: true,
  };
}

export function createPartySocket(
  options: PartySocketOptions = createPartySocketOptions()
): Socket {
  return io(options);
}

/**
 * When a WebSocket-first attempt times out (common on some Safari builds where
 * the handshake hangs), prefer long-polling on the next reconnect.
 */
export function hardenTransportOnConnectError(
  socket: Pick<Socket, 'io'>,
  error: { message?: string }
): boolean {
  const message = error.message?.toLowerCase() ?? '';
  if (!message.includes('timeout')) {
    return false;
  }
  const transports = socket.io.opts.transports;
  if (!Array.isArray(transports) || transports[0] !== 'websocket') {
    return false;
  }
  socket.io.opts.transports = [...POLLING_FIRST];
  return true;
}

/** Run on connect, including immediately when the shared socket is already up. */
export function whenConnected(socket: Socket, handler: () => void): () => void {
  const onConnect = () => {
    handler();
  };
  socket.on('connect', onConnect);
  if (socket.connected) {
    handler();
  }
  return () => {
    socket.off('connect', onConnect);
  };
}

/**
 * Safari/iOS: recover after background suspension, and close/reopen for BFCache.
 */
export function attachPartySocketLifecycle(socket: Socket): () => void {
  const onConnectError = (error: Error) => {
    hardenTransportOnConnectError(socket, error);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && !socket.connected) {
      socket.connect();
    }
  };

  const onPageHide = () => {
    if (socket.connected) {
      socket.disconnect();
    }
  };

  const onPageShow = () => {
    if (!socket.connected) {
      socket.connect();
    }
  };

  socket.on('connect_error', onConnectError);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    socket.off('connect_error', onConnectError);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}

let sharedSocket: Socket | null = null;

export function getPartySocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = createPartySocket();
  }
  return sharedSocket;
}

/** Test-only: replace or clear the process-wide singleton. */
export function resetPartySocketForTests(next: Socket | null = null): void {
  if (sharedSocket?.connected) {
    sharedSocket.disconnect();
  }
  sharedSocket = next;
}
