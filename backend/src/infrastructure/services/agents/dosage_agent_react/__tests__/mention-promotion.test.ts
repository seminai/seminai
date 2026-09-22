import { selectPromotedCompanyId } from '../mention-promotion';
import type { MentionItem } from '../../../../../domain/dtos/mention.dto';

const company = (id: string, label = 'X'): MentionItem => ({ type: 'company', id, label });
const product = (id: string): MentionItem => ({ type: 'product', id, label: id });

describe('selectPromotedCompanyId', () => {
  it('returns the company id when exactly one company mention is present', () => {
    expect(selectPromotedCompanyId([company('uuid-A')])).toBe('uuid-A');
  });

  it('returns undefined when multiple company mentions are present (ambiguous)', () => {
    expect(selectPromotedCompanyId([company('A'), company('B')])).toBeUndefined();
  });

  it('returns undefined when only non-company mentions are present', () => {
    expect(selectPromotedCompanyId([product('p1'), product('p2')])).toBeUndefined();
  });

  it('returns the single company id even when mixed with other mention types', () => {
    expect(selectPromotedCompanyId([company('uuid-A'), product('p1')])).toBe('uuid-A');
  });

  it('returns undefined when mentions is empty', () => {
    expect(selectPromotedCompanyId([])).toBeUndefined();
  });

  it('returns undefined when mentions is undefined', () => {
    expect(selectPromotedCompanyId(undefined)).toBeUndefined();
  });
});
