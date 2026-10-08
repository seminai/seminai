import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AccessTokenRecord,
  AuthCodeRecord,
  LoginSessionRecord,
  OauthClientRecord,
  OauthStore,
} from './types.js';
interface Slot {
  value: unknown;
  expiresAt: number;
}
/** Durable encrypted grants for one connector process. Revocation is checked by Seminai on every request. */
export class FileOauthStore implements OauthStore {
  private slots: Record<string, Slot> = {};
  private readonly key: Buffer;
  constructor(
    private readonly filename: string,
    secret: string,
  ) {
    this.key = createHash('sha256').update(secret).digest();
    if (!existsSync(filename)) return;
    const encrypted = readFileSync(filename);
    const cipher = createDecipheriv('aes-256-gcm', this.key, encrypted.subarray(0, 12));
    cipher.setAuthTag(encrypted.subarray(12, 28));
    this.slots = JSON.parse(
      Buffer.concat([cipher.update(encrypted.subarray(28)), cipher.final()]).toString('utf8'),
    ) as Record<string, Slot>;
  }
  private save(): void {
    this.slots = Object.fromEntries(
      Object.entries(this.slots).filter(([, slot]) => slot.expiresAt > Date.now()),
    );
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(this.slots)), cipher.final()]);
    mkdirSync(dirname(this.filename), { recursive: true, mode: 0o700 });
    const temporary = `${this.filename}.tmp`;
    writeFileSync(temporary, Buffer.concat([nonce, cipher.getAuthTag(), encrypted]), {
      mode: 0o600,
    });
    renameSync(temporary, this.filename);
  }
  private put(key: string, value: unknown, ttl: number): void {
    this.slots[key] = { value, expiresAt: Date.now() + ttl * 1000 };
    this.save();
  }
  private get<T>(key: string): T | null {
    const slot = this.slots[key];
    return slot && slot.expiresAt > Date.now() ? (slot.value as T) : null;
  }
  async putClient(value: OauthClientRecord): Promise<void> {
    this.put(`client:${value.clientId}`, value, 365 * 86400);
  }
  async getClient(id: string): Promise<OauthClientRecord | null> {
    return this.get(`client:${id}`);
  }
  async putAuthCode(id: string, value: AuthCodeRecord, ttl: number): Promise<void> {
    this.put(`code:${id}`, value, ttl);
  }
  async takeAuthCode(id: string): Promise<AuthCodeRecord | null> {
    const value = this.get<AuthCodeRecord>(`code:${id}`);
    delete this.slots[`code:${id}`];
    this.save();
    return value;
  }
  async putAccessToken(id: string, value: AccessTokenRecord, ttl: number): Promise<void> {
    this.put(`token:${id}`, value, ttl);
  }
  async getAccessToken(id: string): Promise<AccessTokenRecord | null> {
    return this.get(`token:${id}`);
  }
  async putLoginSession(id: string, value: LoginSessionRecord, ttl: number): Promise<void> {
    this.put(`login:${id}`, value, ttl);
  }
  async getLoginSession(id: string): Promise<LoginSessionRecord | null> {
    return this.get(`login:${id}`);
  }
}
