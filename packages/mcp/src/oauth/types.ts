export interface OauthClientRecord {
  readonly clientId: string;
  readonly redirectUris: readonly string[];
  readonly tokenEndpointAuthMethod: 'none' | 'client_secret_post';
}

export interface AuthCodeRecord {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly resource: string;
  readonly seminaiJwt: string;
  readonly userId: string;
  readonly email: string;
}

export interface AccessTokenRecord {
  readonly seminaiJwt: string;
  readonly userId: string;
  readonly email: string;
  readonly resource: string;
  readonly clientId: string;
}

export interface LoginSessionRecord {
  readonly seminaiJwt: string;
  readonly userId: string;
  readonly email: string;
}

export interface OauthStore {
  putClient(client: OauthClientRecord): Promise<void>;
  getClient(clientId: string): Promise<OauthClientRecord | null>;
  putAuthCode(code: string, value: AuthCodeRecord, ttlSec: number): Promise<void>;
  takeAuthCode(code: string): Promise<AuthCodeRecord | null>;
  putAccessToken(token: string, value: AccessTokenRecord, ttlSec: number): Promise<void>;
  getAccessToken(token: string): Promise<AccessTokenRecord | null>;
  putLoginSession(id: string, value: LoginSessionRecord, ttlSec: number): Promise<void>;
  getLoginSession(id: string): Promise<LoginSessionRecord | null>;
}
