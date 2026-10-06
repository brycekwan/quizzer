import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  POLLING_FIRST,
  WEBSOCKET_FIRST,
  createPartySocketOptions,
  hardenTransportOnConnectError,
  resetPartySocketForTests,
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
