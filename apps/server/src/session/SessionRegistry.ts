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

type Listener = () => void;

export class SessionRegistry {
  private sessions = new Map<string, Session>();
  private readonly listeners = new Set<Listener>();

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

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
        this.emit();
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
      this.emit();
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
    this.emit();
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
    this.emit();
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
    this.emit();
    return { ok: true, socketId };
  }

  clear(): void {
    this.sessions.clear();
    this.emit();
  }
}
