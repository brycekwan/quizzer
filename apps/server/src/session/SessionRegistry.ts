import {
  isNameTaken,
  isValidPlayerName,
  normalizePlayerName,
} from '@party/shared';

export interface Session {
  id: string;
  name: string;
  connected: boolean;
  socketId: string | null;
}

type LoginResult =
  | { ok: true; session: Session; replacedSocketId: string | null }
  | { ok: false; error: string };

export class SessionRegistry {
  private sessions = new Map<string, Session>();

  get(playerId: string): Session | undefined {
    return this.sessions.get(playerId);
  }

  getBySocket(socketId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.socketId === socketId) {
        return session;
      }
    }
    return undefined;
  }

  private findByName(name: string): Session | undefined {
    const target = normalizePlayerName(name).toLowerCase();
    for (const session of this.sessions.values()) {
      if (normalizePlayerName(session.name).toLowerCase() === target) {
        return session;
      }
    }
    return undefined;
  }

  login(name: string, socketId: string, playerId?: string): LoginResult {
    if (!isValidPlayerName(name)) {
      return { ok: false, error: 'Name must be 1–24 characters' };
    }

    const normalized = normalizePlayerName(name);

    if (playerId) {
      const existing = this.sessions.get(playerId);
      if (existing) {
        if (
          normalizePlayerName(existing.name).toLowerCase() !==
          normalized.toLowerCase()
        ) {
          return { ok: false, error: 'Session expired — please join again' };
        }
        const replacedSocketId =
          existing.socketId && existing.socketId !== socketId
            ? existing.socketId
            : null;
        existing.socketId = socketId;
        existing.connected = true;
        return { ok: true, session: existing, replacedSocketId };
      }
      // Stale id after process restart — fall through to name-based login.
    }

    const byName = this.findByName(normalized);
    if (byName) {
      if (byName.connected && byName.socketId !== socketId) {
        return {
          ok: false,
          error: 'That name is already in use by another player',
        };
      }
      const replacedSocketId =
        byName.socketId && byName.socketId !== socketId
          ? byName.socketId
          : null;
      byName.socketId = socketId;
      byName.connected = true;
      return { ok: true, session: byName, replacedSocketId };
    }

    const names = [...this.sessions.values()].map((s) => s.name);
    if (isNameTaken(normalized, names)) {
      return { ok: false, error: 'That name is already taken' };
    }

    const id = `p_${Math.random().toString(36).slice(2, 10)}`;
    const session: Session = {
      id,
      name: normalized,
      connected: true,
      socketId,
    };
    this.sessions.set(id, session);
    return { ok: true, session, replacedSocketId: null };
  }

  markDisconnected(socketId: string): void {
    const session = this.getBySocket(socketId);
    if (!session) {
      return;
    }
    if (session.socketId !== socketId) {
      return;
    }
    session.connected = false;
    session.socketId = null;
  }

  remove(
    playerId: string
  ): { ok: true; socketId: string | null } | { ok: false; error: string } {
    const session = this.sessions.get(playerId);
    if (!session) {
      return { ok: false, error: 'Player not found' };
    }
    const socketId = session.socketId;
    this.sessions.delete(playerId);
    return { ok: true, socketId };
  }

  clear(): void {
    this.sessions.clear();
  }
}
