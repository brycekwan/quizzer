import { describe, expect, it } from 'vitest';
import { SessionRegistry } from './SessionRegistry';

describe('SessionRegistry', () => {
  it('creates a session for a unique name', () => {
    const registry = new SessionRegistry();
    const result = registry.login('Buddy', 's1');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.session.name).toBe('Buddy');
    expect(result.replacedSocketId).toBeNull();
  });

  it('rejects a name already used by a connected session', () => {
    const registry = new SessionRegistry();
    expect(registry.login('Buddy', 's1').ok).toBe(true);
    const second = registry.login('buddy', 's2');
    expect(second.ok).toBe(false);
  });

  it('reclaims a disconnected session by name', () => {
    const registry = new SessionRegistry();
    const first = registry.login('Buddy', 's1');
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    registry.markDisconnected('s1');
    const reclaim = registry.login('Buddy', 's2');
    expect(reclaim.ok).toBe(true);
    if (!reclaim.ok) {
      return;
    }
    expect(reclaim.session.id).toBe(first.session.id);
  });

  it('returns replacedSocketId on takeover with playerId', () => {
    const registry = new SessionRegistry();
    const first = registry.login('Buddy', 's1');
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const takeover = registry.login('Buddy', 's2', first.session.id);
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) {
      return;
    }
    expect(takeover.replacedSocketId).toBe('s1');
  });
});
