import { detectLanguage } from '../language-detector';

describe('detectLanguage', () => {
  it('detects Italian on a typical agronomic message', () => {
    expect(detectLanguage('Calcola il dosaggio di solfato di rame per due ettari di vigneto')).toBe(
      'it',
    );
  });

  it('detects English on a typical agronomic message', () => {
    expect(detectLanguage('Calculate copper sulfate dosage for two hectares of vineyard')).toBe(
      'en',
    );
  });

  it('falls back to Italian on very short messages (≤ 3 words)', () => {
    expect(detectLanguage('ok')).toBe('it');
    expect(detectLanguage('yes please')).toBe('it');
    expect(detectLanguage('thanks for that')).toBe('it');
  });

  it('falls back to Italian on empty or whitespace input', () => {
    expect(detectLanguage('')).toBe('it');
    expect(detectLanguage('   ')).toBe('it');
    expect(detectLanguage(undefined)).toBe('it');
    expect(detectLanguage(null)).toBe('it');
  });

  it('prefers Italian when input contains Italian distinctive markers', () => {
    expect(detectLanguage('Quando posso fare il prossimo trattamento sul campo?')).toBe('it');
    expect(detectLanguage('Vuoi che verifichi la conformità ai disciplinari?')).toBe('it');
  });

  it('prefers English when EN markers outnumber IT markers', () => {
    expect(detectLanguage('Can you check the stock and the pesticide treatment?')).toBe('en');
    expect(detectLanguage('Please show the harvest and bloom dates for the field')).toBe('en');
  });

  it('defaults to Italian when no markers match (ambiguous longer input)', () => {
    expect(detectLanguage('xxxx yyyy zzzz wwww qqqq')).toBe('it');
  });
});
