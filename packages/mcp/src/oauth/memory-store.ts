import type {
  AccessTokenRecord,
  AuthCodeRecord,
  LoginSessionRecord,
  OauthClientRecord,
  OauthStore,
} from './types.js';

interface Expiring<T> {
  readonly value: T;
  readonly expiresAt: number;
}

function readLive<T>(slot: Expiring<T> | undefined): T | null {
  if (!slot) {
    return null;
  }
  if (slot.expiresAt <= Date.now()) {
    return null;
  }
  return slot.value;
}

/**
 * In-memory OAuth store. Fine for tests and single-instance Cloud Run
 * (enable session affinity). Use Redis in production multi-instance.
 */
export class MemoryOauthStore implements OauthStore {
  private readonly clients = new Map<string, OauthClientRecord>();
  private readonly codes = new Map<string, Expiring<AuthCodeRecord>>();
  private readonly tokens = new Map<string, Expiring<AccessTokenRecord>>();
  private readonly logins = new Map<string, Expiring<LoginSessionRecord>>();

  async putClient(client: OauthClientRecord): Promise<void> {
    this.clients.set(client.clientId, client);
  }

  async getClient(clientId: string): Promise<OauthClientRecord | null> {
    return this.clients.get(clientId) ?? null;
  }

  async putAuthCode(code: string, value: AuthCodeRecord, ttlSec: number): Promise<void> {
    this.codes.set(code, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async takeAuthCode(code: string): Promise<AuthCodeRecord | null> {
    const slot = this.codes.get(code);
    this.codes.delete(code);
    return readLive(slot);
  }

  async putAccessToken(token: string, value: AccessTokenRecord, ttlSec: number): Promise<void> {
    this.tokens.set(token, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async getAccessToken(token: string): Promise<AccessTokenRecord | null> {
    return readLive(this.tokens.get(token));
  }

  async putLoginSession(id: string, value: LoginSessionRecord, ttlSec: number): Promise<void> {
    this.logins.set(id, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async getLoginSession(id: string): Promise<LoginSessionRecord | null> {
    return readLive(this.logins.get(id));
  }
}
