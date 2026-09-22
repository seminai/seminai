import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FatturaPaParser } from '../infrastructure/services/tool/fattura-pa-parser';
import { parseCsv } from '../infrastructure/services/agents/file_agent/utils/csv_parser';
import {
  isLombardiaFormat,
  parseLombardiaDate,
  parseSiscoCropCode,
} from '../infrastructure/services/agents/file_agent/template/lombardia_file_structure';
import { inspectPrivateFixtures } from './fixtures/private-fixture-harness';

const SYNTHETIC_ROOT = path.resolve(__dirname, '../../test-fixtures/synthetic');

describe('Synthetic public fixtures', () => {
  const originalFixturesDirectory = process.env.SEMINAI_FIXTURES_DIR;

  afterEach(() => {
    if (originalFixturesDirectory === undefined) delete process.env.SEMINAI_FIXTURES_DIR;
    else process.env.SEMINAI_FIXTURES_DIR = originalFixturesDirectory;
  });

  it('parses a synthetic FatturaPA document without external data', async () => {
    const parser = new FatturaPaParser();
    const result = await parser.parseFromFile(path.join(SYNTHETIC_ROOT, 'invoice/fattura-pa.xml'));
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      productName: 'SYNTHETIC COPPER PRODUCT',
      quantity: 3,
      quantityUnitOfMeasure: 'L',
      supplierName: 'EXAMPLE AGRICULTURAL SUPPLY SRL',
      supplierVat: '00000000000',
      invoiceNumber: 'SYN-2026-001',
      invoiceDate: '2026-09-01',
      invoiceDueDate: '2026-10-01',
    });
    expect(result.entries.map((entry) => entry.productName)).not.toContain('SCONTO TEST');
  });

  it('detects and parses a synthetic Lombardia field row', () => {
    const content = fs.readFileSync(path.join(SYNTHETIC_ROOT, 'field/lombardia.csv'), 'utf8');
    const parsed = parseCsv(content);
    expect(isLombardiaFormat(parsed.headers)).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].CUAA).toBe('SYNTHETIC0000001');
    expect(parseLombardiaDate(parsed.rows[0]['DATA SEMINA'])).toBe('2026-03-15');
    expect(parseSiscoCropCode(parsed.rows[0]['TIPO UTILIZZO'])).toMatchObject({
      codOccupazione: '001',
      codDestinazione: '011',
      codUso: '000',
      codQualita: '000',
    });
  });

  it('rejects a private fixture directory inside the repository', () => {
    process.env.SEMINAI_FIXTURES_DIR = SYNTHETIC_ROOT;
    expect(() => inspectPrivateFixtures()).toThrow('must be outside the repository');
  });

  it('summarizes an external fixture without logging metadata', () => {
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seminai-fixtures-'));
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      fs.writeFileSync(path.join(externalRoot, 'synthetic.txt'), 'fabricated fixture');
      process.env.SEMINAI_FIXTURES_DIR = externalRoot;
      expect(inspectPrivateFixtures()).toEqual({
        configured: true,
        fileCount: 1,
        totalBytes: 18,
      });
      expect(output).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
      fs.rmSync(externalRoot, { recursive: true, force: true });
    }
  });
});
