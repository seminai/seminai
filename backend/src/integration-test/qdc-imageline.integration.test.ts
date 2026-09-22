import dotenv from 'dotenv';
dotenv.config();

import {
  getHistoryDateRange,
  getQdcApiFromClientId,
  getTokenFromClientId,
  parseTableToRecords,
} from '../infrastructure/services/integrations/qdc_imageline';
import type { QdcTableResult } from '../infrastructure/services/integrations/qdc_imageline';

// SAFETY: this suite is strictly READ-ONLY (get* endpoints only). QDC data is
// the farmer's OFFICIAL field logbook: never exercise set*/del* endpoints in
// tests except against the dedicated test company (e.g. "AZIENDA PROVA").
const clientId = process.env.QDC_TEST_CLIENT_ID || process.env.IMAGE_LINE_CLIENT_ID;
const describeOrSkip = clientId ? describe : describe.skip;

function logColumns(label: string, result: QdcTableResult | undefined): void {
  const columns = result?.COLUMNS ?? result?.columns ?? null;
  console.log(`[qdc] ${label} COLUMNS:`, JSON.stringify(columns));
}

function expectRecordsetShape(result: QdcTableResult | undefined): void {
  if (!result) {
    return;
  }
  const columns = result.COLUMNS ?? result.columns;
  const data = result.DATA ?? result.data;
  expect(Array.isArray(columns)).toBe(true);
  expect((columns ?? []).every((column) => typeof column === 'string')).toBe(true);
  expect(Array.isArray(data)).toBe(true);
}

describeOrSkip('QDC ImageLine REST API — real API smoke', () => {
  jest.setTimeout(60_000);

  it('obtains a client_credentials token with the full scope set (or legacy fallback)', async () => {
    const actualToken = await getTokenFromClientId(clientId!);
    expect(typeof actualToken).toBe('string');
    expect(actualToken.length).toBeGreaterThan(10);
  });

  it('reads license info, companies and company-scoped resources end to end', async () => {
    const api = await getQdcApiFromClientId(clientId!);
    const licenza = await api.licenza.getLicenzaInfo();
    expect(licenza.message).toBeDefined();
    console.log('[qdc] licenza info:', JSON.stringify(licenza.result));
    const aziende = await api.licenza.getLicenzaAziende();
    expectRecordsetShape(aziende.result);
    logColumns('getlicenzaaziende', aziende.result);
    const firstRow = aziende.result?.DATA?.[0];
    if (!firstRow) {
      console.warn('[qdc] license has no companies — skipping company-scoped checks');
      return;
    }
    const idAzienda = Number(firstRow[0]);
    expect(Number.isFinite(idAzienda)).toBe(true);
    const unita = await api.colture.getUnita({ idAzienda, anno: new Date().getFullYear() });
    expectRecordsetShape(unita.result);
    logColumns('getunita', unita.result);
    const scadenze = await api.licenza.getScadenze(idAzienda);
    expect(Array.isArray(scadenze.patentini)).toBe(true);
    expect(Array.isArray(scadenze.tarature)).toBe(true);
    console.log(
      `[qdc] getscadenze patentini=${scadenze.patentini.length} tarature=${scadenze.tarature.length}`,
    );
    const range = getHistoryDateRange(30);
    const trattamenti = await api.operazioniCampo.getTrattamenti({
      idAzienda,
      dataPeriodoDa: range.dataDa,
      dataPeriodoA: range.dataA,
    });
    expectRecordsetShape(trattamenti.result);
    logColumns('gettrattamenti', trattamenti.result);
    console.log(
      '[qdc] gettrattamenti first record:',
      JSON.stringify(parseTableToRecords(trattamenti.result)[0] ?? null),
    );
    const registro = await api.stampe.getRegistroTrattamenti({ idAzienda, elementi: 1 });
    expectRecordsetShape(registro.result);
    logColumns('getregistrotrattamenti', registro.result);
  });
});
