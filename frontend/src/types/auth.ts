export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly profilePictureUrl: string | null;
  readonly role: 'ADMIN' | 'GOD' | 'BASIC' | 'LABEL_MANAGER';
  readonly credits: number;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly status: string;
  readonly data: {
    readonly token: string;
    readonly user: AuthUser;
  };
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly inviteCode: string;
  readonly surname?: string;
  readonly fiscalCode?: string;
  readonly phoneNumber?: string;
  readonly address?: string;
}

export interface RegisterResponse {
  readonly status: string;
  readonly data: {
    readonly user: AuthUser;
    readonly message: string;
  };
}

export interface BookCallRequest {
  readonly name: string;
  readonly email: string;
  readonly body: string;
}
