import { describe, expect, it } from 'vitest';
import { sanitizeMarkdownTableData } from './filterable-markdown-table';

const UNIT_ID = '41d8705a-2e9f-409d-a3e2-5005817b2857';

describe('sanitizeMarkdownTableData', () => {
  it('masks technical IDs from chat markdown table headers and cells', () => {
    const sanitized = sanitizeMarkdownTableData(
      ['productionUnitId', 'Unità', 'Note'],
      [[UNIT_ID, UNIT_ID, `Intervento su ${UNIT_ID}`]],
    );

    expect(sanitized.headers).toEqual(['Production Unit', 'Unità', 'Note']);
    expect(sanitized.rows[0]).toEqual([
      '[identificativo nascosto]',
      '[identificativo nascosto]',
      'Intervento su [identificativo nascosto]',
    ]);
  });
});
