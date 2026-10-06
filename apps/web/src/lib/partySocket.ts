import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

export const WEBSOCKET_FIRST = ['websocket', 'polling'] as const;
export const POLLING_FIRST = ['polling', 'websocket'] as const;

export type PartySocketOptions = Partial<ManagerOptions & SocketOptions>;

/** After this long in the background, drop and reopen the socket (mobile screen lock). */
export const BACKGROUND_RECONNECT_MS = 2_000;

/** Shared Socket.IO options tuned for Safari/iOS WebSocket flakiness. */
export function createPartySocketOptions(): PartySocketOptions {
  return {
    path: '/socket.io',
    transports: [...WEBSOCKET_FIRST],
    tryAllTransports: true,
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3_000,
  };
}

/** True when the tab was hidden long enough that the socket is likely stale. */
export function shouldRefreshSocketAfterBackground(
  hiddenAt: number | null,
  now: number
): boolean {
  if (hiddenAt == null) {
    return false;
  }
  return now - hiddenAt >= BACKGROUND_RECONNECT_MS;
}

/** Start a new connection attempt; disconnect first when forcing a refresh. */
export function refreshSocketConnection(socket: Socket, force: boolean): void {
  if (!force) {
    if (!socket.connected) {
      socket.connect();
    }
    return;
  }
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
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

  let hiddenAt: number | null = null;

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const now = Date.now();
    const stale = shouldRefreshSocketAfterBackground(hiddenAt, now);
    hiddenAt = null;
    if (stale || !socket.connected) {
      refreshSocketConnection(socket, stale);
    }
  };

  const onOnline = () => {
    refreshSocketConnection(socket, !socket.connected);
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
  window.addEventListener('online', onOnline);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    socket.off('connect_error', onConnectError);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
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
