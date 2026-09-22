import {
  extractVatAndFiscalCodes,
  matchCompanyByVat,
  pickSingleCompany,
} from '../infrastructure/services/extraction/vat-company-matcher';
import { type PreclassificationCompany } from '../domain/dtos/preclassification.dto';

function company(overrides: Partial<PreclassificationCompany>): PreclassificationCompany {
  return {
    id: 'id',
    name: 'Azienda',
    vatNumber: '00000000000',
    fiscalCode: 'FISCALCODE00',
    cuaa: null,
    city: null,
    ...overrides,
  };
}

describe('extractVatAndFiscalCodes', () => {
  it('extracts an 11-digit VAT with the IT prefix and surrounding space', () => {
    const actual = extractVatAndFiscalCodes('Partita IVA: IT 01234567890');
    expect(actual.vatNumbers).toContain('01234567890');
  });

  it('extracts a bare 11-digit VAT', () => {
    const actual = extractVatAndFiscalCodes('Cliente con p.iva 09876543210 in fattura');
    expect(actual.vatNumbers).toContain('09876543210');
  });

  it('extracts a 16-char personal fiscal code', () => {
    const actual = extractVatAndFiscalCodes('Codice Fiscale RSSMRA80A01H501U');
    expect(actual.fiscalCodes).toContain('RSSMRA80A01H501U');
  });

  it('returns empty arrays when nothing matches', () => {
    const actual = extractVatAndFiscalCodes('Nessun codice qui, solo testo.');
    expect(actual.vatNumbers).toHaveLength(0);
    expect(actual.fiscalCodes).toHaveLength(0);
  });
});

describe('matchCompanyByVat', () => {
  const companies = [
    company({ id: 'a', vatNumber: '01234567890' }),
    company({ id: 'b', vatNumber: '09876543210' }),
  ];

  it('matches a single company by VAT', () => {
    const codes = extractVatAndFiscalCodes('Fornitore IT01234567890');
    const actual = matchCompanyByVat({ codes, companies });
    expect(actual.companyId).toBe('a');
    expect(actual.vatHint).toBe('01234567890');
  });

  it('matches by fiscal code even when the printed name differs', () => {
    const namedDifferently = [
      company({ id: 'x', name: 'Altro Nome', fiscalCode: 'RSSMRA80A01H501U' }),
    ];
    const codes = extractVatAndFiscalCodes('CF RSSMRA80A01H501U');
    const actual = matchCompanyByVat({ codes, companies: namedDifferently });
    expect(actual.companyId).toBe('x');
  });

  it('returns null when no company matches', () => {
    const codes = extractVatAndFiscalCodes('IT11111111111');
    const actual = matchCompanyByVat({ codes, companies });
    expect(actual.companyId).toBeNull();
  });

  it('returns null when the VAT is ambiguous (matches more than one company)', () => {
    const ambiguous = [
      company({ id: 'a', vatNumber: '01234567890' }),
      company({ id: 'b', vatNumber: '01234567890' }),
    ];
    const codes = extractVatAndFiscalCodes('IT01234567890');
    const actual = matchCompanyByVat({ codes, companies: ambiguous });
    expect(actual.companyId).toBeNull();
  });
});

describe('pickSingleCompany', () => {
  it('returns the id when exactly one company exists', () => {
    expect(pickSingleCompany([company({ id: 'only' })])).toBe('only');
  });

  it('returns null for zero or multiple companies', () => {
    expect(pickSingleCompany([])).toBeNull();
    expect(pickSingleCompany([company({ id: 'a' }), company({ id: 'b' })])).toBeNull();
  });
});
