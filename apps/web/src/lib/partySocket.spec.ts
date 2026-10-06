import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_RECONNECT_MS,
  POLLING_FIRST,
  WEBSOCKET_FIRST,
  createPartySocketOptions,
  hardenTransportOnConnectError,
  refreshSocketConnection,
  resetPartySocketForTests,
  shouldRefreshSocketAfterBackground,
} from './partySocket';

describe('partySocket options', () => {
  afterEach(() => {
    resetPartySocketForTests(null);
  });

  it('prefers WebSocket first but keeps polling and tryAllTransports', () => {
    const options = createPartySocketOptions();
    expect(options.path).toBe('/socket.io');
    expect(options.transports).toEqual([...WEBSOCKET_FIRST]);
    expect(options.tryAllTransports).toBe(true);
    expect(options.reconnection).toBe(true);
    expect(options.reconnectionDelay).toBe(500);
    expect(options.reconnectionDelayMax).toBe(3_000);
  });

  it('refreshes the socket after a long background', () => {
    const now = 10_000;
    expect(shouldRefreshSocketAfterBackground(null, now)).toBe(false);
    expect(shouldRefreshSocketAfterBackground(now - 500, now)).toBe(false);
    expect(
      shouldRefreshSocketAfterBackground(now - BACKGROUND_RECONNECT_MS, now)
    ).toBe(true);
  });

  it('refreshSocketConnection disconnects when forcing a stale socket', () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    const socket = { connected: true, connect, disconnect };

    refreshSocketConnection(socket as never, true);
    expect(disconnect).toHaveBeenCalled();
    expect(connect).toHaveBeenCalled();
  });

  it('switches to polling-first after a WebSocket-first timeout', () => {
    const socket = {
      io: {
        opts: {
          transports: [...WEBSOCKET_FIRST] as string[],
        },
      },
    };

    expect(
      hardenTransportOnConnectError(socket, { message: 'timeout' })
    ).toBe(true);
    expect(socket.io.opts.transports).toEqual([...POLLING_FIRST]);
  });

  it('leaves transports alone for non-timeout errors', () => {
    const socket = {
      io: {
        opts: {
          transports: [...WEBSOCKET_FIRST] as string[],
        },
      },
    };

    expect(
      hardenTransportOnConnectError(socket, { message: 'xhr poll error' })
    ).toBe(false);
    expect(socket.io.opts.transports).toEqual([...WEBSOCKET_FIRST]);
  });

  it('whenConnected runs immediately if already connected', async () => {
    const { whenConnected } = await import('./partySocket');
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const set = handlers.get(event) ?? new Set();
        set.add(handler);
        handlers.set(event, set);
        return socket;
      }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.get(event)?.delete(handler);
        return socket;
      }),
    };

    const handler = vi.fn();
    const detach = whenConnected(socket as never, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    detach();
    expect(socket.off).toHaveBeenCalled();
  });
});
