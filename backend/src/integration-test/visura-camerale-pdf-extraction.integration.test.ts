import fs from 'fs';
import path from 'path';
import { VisuraCameralePdfAgent } from '../infrastructure/services/agents/company/visura_camerale_pdf_agent';

jest.setTimeout(180000);

describe('Visura Camerale PDF Extraction Integration Test', () => {
  const fixtureDir = path.resolve(process.cwd(), 'dataset/visura_camerale');

  it('should extract company anagrafica from a real visura camerale PDF', async () => {
    const fixturePath = pickFirstPdfFixture(fixtureDir);

    if (!fixturePath) {
      console.warn(
        `[visura-camerale] No fixture PDF found in ${fixtureDir}. ` +
          `Add at least one .pdf file to enable this test. Skipping.`,
      );
      return;
    }

    const pdfBuffer = fs.readFileSync(fixturePath);
    const agent = new VisuraCameralePdfAgent();
    const extracted = await agent.extractFromPdf(pdfBuffer);

    console.log(`[visura-camerale] Extracted from ${path.basename(fixturePath)}:`, extracted);

    expect(extracted).toBeDefined();
    expect(extracted.name).toBeTruthy();

    if (extracted.vatNumber) {
      expect(extracted.vatNumber).toMatch(/^[0-9]{11}$/);
    }
    if (extracted.fiscalCode) {
      expect(extracted.fiscalCode).toMatch(/^[A-Z0-9]{11,16}$/);
    }
    if (extracted.cap) {
      expect(extracted.cap).toMatch(/^[0-9]{5}$/);
    }
  });

  it('should reject an empty/illegible PDF', async () => {
    const agent = new VisuraCameralePdfAgent();
    const tinyBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\nxref\n0 3\n0000000000 65535 f\ntrailer<</Size 3/Root 1 0 R>>\n%%EOF',
    );
    await expect(agent.extractFromPdf(tinyBuffer)).rejects.toThrow();
  });
});

function pickFirstPdfFixture(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  const pdf = entries.find((name) => name.toLowerCase().endsWith('.pdf'));
  return pdf ? path.join(dir, pdf) : null;
}
