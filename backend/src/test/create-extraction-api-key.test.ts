import {
  generateApiKeySecret,
  hashApiKey,
} from '../infrastructure/services/extraction-api/api-key-crypto';

describe('api-key-crypto', () => {
  it('hashes API keys deterministically', () => {
    const secret = 'sk_live_abc123';
    expect(hashApiKey(secret)).toBe(hashApiKey(secret));
    expect(hashApiKey(secret)).toHaveLength(64);
  });

  it('generates secrets with sk_live prefix and display prefix', () => {
    const generated = generateApiKeySecret();
    expect(generated.secret.startsWith('sk_live_')).toBe(true);
    expect(generated.prefix.startsWith('sk_live_')).toBe(true);
    expect(generated.secret.length).toBeGreaterThan(generated.prefix.length);
  });
});
