import { resolveCompanyForExtraction } from '../application/services/extraction-company-resolver';
import type { MentionItem } from '../domain/dtos/mention.dto';

function company(id: string, name: string) {
  return { id, name };
}

function mention(type: MentionItem['type'], id: string, label = id): MentionItem {
  return { type, id, label };
}

describe('resolveCompanyForExtraction', () => {
  it('returns noCompanies when user has none', () => {
    const result = resolveCompanyForExtraction({ mentions: [], userCompanies: [] });
    expect(result).toEqual({ kind: 'noCompanies' });
  });

  it('returns auto when user has exactly one company and no mention', () => {
    const userCompanies = [company('c1', 'Azienda Rossi')];
    const result = resolveCompanyForExtraction({ mentions: [], userCompanies });
    expect(result).toEqual({ kind: 'auto', companyId: 'c1' });
  });

  it('returns mention when exactly one accessible @company is mentioned', () => {
    const userCompanies = [company('c1', 'Azienda Rossi'), company('c2', 'Azienda Bianchi')];
    const mentions = [mention('company', 'c2', 'Azienda Bianchi')];
    const result = resolveCompanyForExtraction({ mentions, userCompanies });
    expect(result).toEqual({ kind: 'mention', companyId: 'c2' });
  });

  it('ignores @company mentions referring to companies the user cannot access', () => {
    const userCompanies = [company('c1', 'Azienda Rossi')];
    const mentions = [mention('company', 'OTHER', 'Foreign Co')];
    const result = resolveCompanyForExtraction({ mentions, userCompanies });
    expect(result).toEqual({ kind: 'auto', companyId: 'c1' });
  });

  it('ignores non-company mentions and falls back to auto / needsQuestion', () => {
    const userCompanies = [company('c1', 'Azienda Rossi'), company('c2', 'Azienda Bianchi')];
    const mentions = [mention('field', 'f1', 'Campo Sud')];
    const result = resolveCompanyForExtraction({ mentions, userCompanies });
    expect(result.kind).toBe('needsQuestion');
    if (result.kind === 'needsQuestion') {
      expect(result.options).toHaveLength(2);
    }
  });

  it('returns needsQuestion with only the mentioned options when 2+ @company are mentioned', () => {
    const userCompanies = [
      company('c1', 'Azienda A'),
      company('c2', 'Azienda B'),
      company('c3', 'Azienda C'),
    ];
    const mentions = [mention('company', 'c1', 'A'), mention('company', 'c3', 'C')];
    const result = resolveCompanyForExtraction({ mentions, userCompanies });
    expect(result.kind).toBe('needsQuestion');
    if (result.kind === 'needsQuestion') {
      expect(result.options.map((o) => o.id)).toEqual(['c1', 'c3']);
    }
  });

  it('deduplicates repeated @company mentions of the same id', () => {
    const userCompanies = [company('c1', 'Azienda Rossi')];
    const mentions = [mention('company', 'c1', 'Rossi'), mention('company', 'c1', 'Rossi')];
    const result = resolveCompanyForExtraction({ mentions, userCompanies });
    expect(result).toEqual({ kind: 'mention', companyId: 'c1' });
  });

  it('returns needsQuestion with all companies when N>1 and no @company mention', () => {
    const userCompanies = [company('c1', 'A'), company('c2', 'B')];
    const result = resolveCompanyForExtraction({ mentions: [], userCompanies });
    expect(result.kind).toBe('needsQuestion');
    if (result.kind === 'needsQuestion') {
      expect(result.options).toHaveLength(2);
    }
  });
});
