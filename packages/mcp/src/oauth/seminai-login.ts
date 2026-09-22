export interface SeminaiLoginResult {
  readonly token: string;
  readonly userId: string;
  readonly email: string;
}

interface LoginEnvelope {
  readonly status?: string;
  readonly message?: string;
  readonly data?: {
    readonly token?: string;
    readonly user?: { readonly id?: string; readonly email?: string };
  };
}

export async function loginToSeminai(
  apiBaseUrl: string,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SeminaiLoginResult> {
  const response = await fetchImpl(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json().catch(() => ({}))) as LoginEnvelope;
  const token = payload.data?.token;
  const userId = payload.data?.user?.id;
  if (!response.ok || !token || !userId) {
    throw new Error(payload.message ?? 'Invalid credentials');
  }
  return { token, userId, email: payload.data?.user?.email ?? email };
}
