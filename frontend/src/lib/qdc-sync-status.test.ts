import { describe, expect, it } from 'vitest';
import {
  describeQdcSyncStatus,
  formatQdcSyncCounters,
  formatQdcSyncDate,
} from './qdc-sync-status';

describe('describeQdcSyncStatus', () => {
  it('maps every known status to an Italian label', () => {
    expect(describeQdcSyncStatus('running').label).toBe('In corso…');
    expect(describeQdcSyncStatus('success').label).toBe('Completata');
    expect(describeQdcSyncStatus('partial').label).toBe('Parziale');
    expect(describeQdcSyncStatus('error').label).toBe('Errore');
  });

  it('falls back to an unknown descriptor for unexpected values', () => {
    expect(describeQdcSyncStatus(undefined).label).toBe('Sconosciuto');
    expect(describeQdcSyncStatus('boom').label).toBe('Sconosciuto');
  });
});

describe('formatQdcSyncCounters', () => {
  it('joins the available counters and appends the failed count', () => {
    const actualSummary = formatQdcSyncCounters({
      aziendeTotal: 16,
      aziendeFailed: 2,
      unitaUpserted: 90,
      operazioniUpserted: 340,
      giacenzeRows: 96,
      scadenzeRows: 12,
    });
    expect(actualSummary).toBe(
      '16 aziende · 90 unità · 340 operazioni · 96 giacenze · 12 scadenze (2 aziende con errori)',
    );
  });

  it('returns null for missing or empty counters', () => {
    expect(formatQdcSyncCounters(null)).toBeNull();
    expect(formatQdcSyncCounters({})).toBeNull();
  });
});

describe('formatQdcSyncDate', () => {
  it('formats ISO dates and rejects invalid input', () => {
    expect(formatQdcSyncDate('2026-07-02T02:30:00.000Z')).toContain('2026');
    expect(formatQdcSyncDate('not-a-date')).toBeNull();
    expect(formatQdcSyncDate(null)).toBeNull();
  });
});
