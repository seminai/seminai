/**
 * Smoke test standalone per la pipeline di estrazione.
 * Eseguito con `npx tsx scripts/smoke-test-extraction.ts`.
 * Non richiede Jest né DB: valida solo le unità pure (TableNormalizer,
 * row-validator, deterministic fallback).
 */
import {
  normalizeTablesFromMarkdown,
  parseNumber,
} from '../src/infrastructure/services/extraction/table-normalizer';
import {
  canonicalizeUnit,
  validateRowCoherence,
} from '../src/infrastructure/services/extraction/row-validator';
import { InvoiceDeterministicFallbackParser } from '../src/infrastructure/services/tool/invoice-deterministic-fallback-parser';
import { DdtDeterministicFallbackParser } from '../src/infrastructure/services/tool/ddt-deterministic-fallback-parser';

type Assertion = () => void;

const tests: { name: string; run: Assertion }[] = [];

function test(name: string, run: Assertion): void {
  tests.push({ name, run });
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

function assertTrue(cond: boolean, label: string): void {
  if (!cond) throw new Error(label);
}

test('parseNumber: Italian decimal comma', () => {
  assertEqual(parseNumber('1,50'), 1.5, 'parseNumber("1,50")');
  assertEqual(parseNumber('1.234,56'), 1234.56, 'parseNumber("1.234,56")');
  assertEqual(parseNumber('€ 42,00'), 42, 'parseNumber("€ 42,00")');
  assertEqual(parseNumber(null), null, 'parseNumber(null)');
  assertEqual(parseNumber('-'), null, 'parseNumber("-")');
});

test('canonicalizeUnit: common aliases', () => {
  assertEqual(canonicalizeUnit('KG'), 'KG', 'KG');
  assertEqual(canonicalizeUnit('Lt.'), 'LT', 'Lt. → LT (canonical)');
  assertEqual(canonicalizeUnit('Litri'), 'L', 'Litri → L (alias)');
  assertEqual(canonicalizeUnit('Quintali'), 'Q', 'Quintali');
  assertEqual(canonicalizeUnit('Pezzi'), 'PZ', 'Pezzi');
  assertEqual(canonicalizeUnit('XYZ'), null, 'XYZ → null');
});

test('validateRowCoherence: ok + mismatches', () => {
  const ok = validateRowCoherence({
    quantity: 10,
    quantityUnitOfMeasure: 'KG',
    unitPrice: 5,
    totalPrice: 50,
  });
  assertEqual(ok.needsReview, false, 'coherent row');
  const mismatch = validateRowCoherence({
    quantity: 10,
    quantityUnitOfMeasure: 'KG',
    unitPrice: 5,
    totalPrice: 999,
  });
  assertTrue(mismatch.needsReview, 'mismatch should flag review');
  const badUnit = validateRowCoherence({
    quantity: 3,
    quantityUnitOfMeasure: 'BOH',
    unitPrice: null,
    totalPrice: null,
  });
  assertTrue(badUnit.needsReview, 'unknown UM should flag review');
});

test('TableNormalizer: columns out of order', () => {
  const md = [
    '| Descrizione | UM | Prezzo | Qta | Totale |',
    '| --- | --- | --- | --- | --- |',
    '| SERCADIS SC 1 L | PZ | 120,00 | 4 | 480,00 |',
  ].join('\n');
  const { tables } = normalizeTablesFromMarkdown(md);
  assertEqual(tables.length, 1, 'one table');
  const row = tables[0].rows[0];
  assertEqual(row.productName, 'SERCADIS SC 1 L', 'productName');
  assertEqual(row.quantity, 4, 'qty');
  assertEqual(row.quantityUnitOfMeasure, 'PZ', 'UM');
  assertEqual(row.unitPrice, 120, 'unit price');
  assertEqual(row.totalPrice, 480, 'total price');
});

test('TableNormalizer: preserves surrounding text', () => {
  const md = [
    'Fornitore: ALBAVERDE S.N.C.',
    'FT 1/155 del 28/02/2025',
    '',
    '| Descrizione | Qta | UM |',
    '| --- | --- | --- |',
    '| ZYPAR 1 L | 2 | PZ |',
    '',
    'Totale: 100,00',
  ].join('\n');
  const { tables, surroundingText } = normalizeTablesFromMarkdown(md);
  assertEqual(tables.length, 1, 'one table detected');
  assertTrue(surroundingText.includes('FT 1/155'), 'surrounding text keeps invoice number');
  assertTrue(surroundingText.includes('Fornitore'), 'surrounding keeps supplier line');
});

test('InvoiceDeterministicFallbackParser: schema-aware', () => {
  const md = [
    'Azienda: ALB - ALBAVERDE S.N.C.',
    '| FT 1/155 28/02/25 | 501.03806 - AZ.AGR.GIORGI ADA |',
    '| --- | --- |',
    '',
    '| Codice | Descrizione | Qta | UM | Prezzo | Totale |',
    '| --- | --- | --- | --- | --- | --- |',
    '| C02460 | CONC. NITR.AMM. 27% + CaO 11,6% da kg. 600 GRANULARE | 1,800 | TM | 350,00 | 630,00 |',
    '| SE2714 | LOIETTO ITALICO MIURA da kg. 25 | 350 | KG | 2,10 | 735,00 |',
  ].join('\n');
  const parser = new InvoiceDeterministicFallbackParser();
  const entries = parser.execute({ text: md });
  assertTrue(entries.length >= 2, `fallback produced ${entries.length} rows`);
  const conc = entries.find((e) => e.productName.includes('CONC. NITR.AMM.'));
  const loietto = entries.find((e) => e.productName.includes('LOIETTO ITALICO MIURA'));
  assertTrue(conc !== undefined, 'CONC.NITR.AMM row present');
  assertTrue(loietto !== undefined, 'LOIETTO row present');
  assertEqual(conc!.quantity, 1.8, 'conc qty');
  assertEqual(conc!.quantityUnitOfMeasure, 'TM', 'conc UM');
  assertEqual(loietto!.quantity, 350, 'loietto qty');
  assertEqual(loietto!.quantityUnitOfMeasure, 'KG', 'loietto UM');
});

test('DdtDeterministicFallbackParser: ddtDate + orderNumber', () => {
  const md = [
    'Azienda: ALB - ALBAVERDE S.N.C.',
    'Data DDT: 12/03/2025',
    'N. ordine: ORD-2025/0042',
    '',
    '| Codice | Descrizione | Qta | UM |',
    '| --- | --- | --- | --- |',
    '| XSER030S | SERCADIS SC 1 L | 4 | PZ |',
    '| KSE0820 | ZYPAR LT.1 | 2 | LT |',
  ].join('\n');
  const parser = new DdtDeterministicFallbackParser();
  const entries = parser.execute({ text: md });
  assertEqual(entries.length, 2, 'two DDT rows');
  assertEqual(entries[0].ddtDate, '2025-03-12', 'ddtDate');
  assertEqual(entries[0].orderNumber, 'ORD-2025/0042', 'orderNumber');
  assertEqual(entries[1].productName, 'ZYPAR LT.1', 'product name');
});

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`  ok  ${t.name}`);
    passed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${t.name}\n       ${message}`);
    failed += 1;
  }
}
console.log(`\n${passed}/${tests.length} tests passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) {
  process.exit(1);
}
