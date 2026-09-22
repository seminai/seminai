import { extractProfessionalContext } from '../memory/user-profile-fact-extractor';

describe('extractProfessionalContext', () => {
  it('extracts the professional context from explicit Italian statements', () => {
    const result = extractProfessionalContext('Mi occupo di marketing, te lo ho gia detto');

    expect(result).toBe('marketing');
  });

  it('returns null when no stable profile fact is stated', () => {
    const result = extractProfessionalContext('Perche mi ripeti le stesse cose?');

    expect(result).toBeNull();
  });
});
