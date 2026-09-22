import { createHash } from 'node:crypto';
import { sha256Base64Url, verifyPkceS256 } from '../oauth/crypto';
import { isTrustedRedirectUri } from '../oauth/flow';
import { MemoryOauthStore } from '../oauth/memory-store';
import { loadHttpConfig } from '../http-config';

describe('PKCE S256', () => {
  it('accepts a matching verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = sha256Base64Url(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('rejects a mismatched verifier', () => {
    expect(verifyPkceS256('aaaa', sha256Base64Url('bbbb'))).toBe(false);
  });
});

describe('isTrustedRedirectUri', () => {
  it('allows Claude and ChatGPT https callbacks', () => {
    expect(isTrustedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isTrustedRedirectUri('https://chatgpt.com/connector/callback')).toBe(true);
  });

  it('allows localhost http for development', () => {
    expect(isTrustedRedirectUri('http://localhost:5173/callback')).toBe(true);
  });

  it('rejects arbitrary hosts', () => {
    expect(isTrustedRedirectUri('https://evil.example/callback')).toBe(false);
  });
});

describe('MemoryOauthStore', () => {
  it('stores and consumes an authorization code once', async () => {
    const store = new MemoryOauthStore();
    await store.putAuthCode(
      'code-1',
      {
        clientId: 'c',
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: 'x',
        resource: 'https://mcp.example/mcp',
        seminaiJwt: 'jwt',
        userId: 'u1',
        email: 'a@b.c',
      },
      60,
    );
    const first = await store.takeAuthCode('code-1');
    const second = await store.takeAuthCode('code-1');
    expect(first?.userId).toBe('u1');
    expect(second).toBeNull();
  });
});

describe('loadHttpConfig', () => {
  it('builds resourceUrl from PUBLIC_BASE_URL', () => {
    const actual = loadHttpConfig({
      SEMINAI_API_BASE_URL: 'https://seminai-be.example',
      PUBLIC_BASE_URL: 'https://mcp.example/',
      MCP_OAUTH_SIGNING_KEY: '1234567890abcdef',
    });
    expect(actual.publicBaseUrl).toBe('https://mcp.example');
    expect(actual.resourceUrl).toBe('https://mcp.example/mcp');
  });

  it('throws when signing key is missing', () => {
    expect(() =>
      loadHttpConfig({
        SEMINAI_API_BASE_URL: 'https://seminai-be.example',
        PUBLIC_BASE_URL: 'https://mcp.example',
      }),
    ).toThrow(/Invalid Seminai MCP HTTP config/);
  });
});
