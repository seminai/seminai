import { sanitizeForJsonb } from '../infrastructure/services/extraction/jsonb-sanitizer';

describe('sanitizeForJsonb', () => {
  it('removes PostgreSQL-rejected control characters from values and keys', () => {
    const actual = sanitizeForJsonb({
      'bad\u0000key': 'AZIENDA\u0000 1',
      nested: {
        value: 'unsupported\u0008escape',
      },
      rows: ['one\u000Btwo'],
    });

    expect(actual).toEqual({
      badkey: 'AZIENDA 1',
      nested: {
        value: 'unsupportedescape',
      },
      rows: ['onetwo'],
    });
  });

  it('serializes Date values before JSONB persistence', () => {
    const actual = sanitizeForJsonb({
      parsedAt: new Date('2026-06-20T08:00:00.000Z'),
    });

    expect(actual).toEqual({
      parsedAt: '2026-06-20T08:00:00.000Z',
    });
  });
});
