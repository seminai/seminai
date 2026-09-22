import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { ProductRegistrationLookupService } from '../infrastructure/services/utils/ProductRegistrationLookup';
import { DdtProductClassifier } from '../infrastructure/services/tool/ddt-product-classifier';
import { InvoiceProductClassifier } from '../infrastructure/services/tool/invoice-product-classifier';

const datasetPath = path.join(
  os.tmpdir(),
  `fitosanitari-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
);

function writeTestDataset(): void {
  fs.writeFileSync(
    datasetPath,
    JSON.stringify(
      [
        {
          num_registrazione: '012096',
          denominazione_prodotto: 'POLTIGLIA DISPERS',
          ragione_sociale: 'MANICA S.P.A.',
          stato_amministrativo: 'Autorizzato',
        },
        {
          num_registrazione: '08184',
          denominazione_prodotto: 'CHALLENGE',
          ragione_sociale: 'BAYER',
          stato_amministrativo: 'Revocato',
        },
        {
          num_registrazione: '000005',
          denominazione_prodotto: 'AGROXONE 96',
          ragione_sociale: 'SOLPLANT S.P.A.',
          stato_amministrativo: 'Revocato',
        },
        {
          num_registrazione: '015100',
          denominazione_prodotto: 'DUAL GOLD 960',
          ragione_sociale: 'SYNGENTA',
          stato_amministrativo: 'Autorizzato',
        },
        {
          num_registrazione: '015101',
          denominazione_prodotto: 'DUAL GOLD MAX',
          ragione_sociale: 'SYNGENTA',
          stato_amministrativo: 'Autorizzato',
        },
        {
          num_registrazione: '020025',
          denominazione_prodotto: 'ZAMPIRO 25 FORTE',
          ragione_sociale: 'TEST',
          stato_amministrativo: 'Autorizzato',
        },
        {
          num_registrazione: '020030',
          denominazione_prodotto: 'ZAMPIRO 30 FORTE',
          ragione_sociale: 'TEST',
          stato_amministrativo: 'Autorizzato',
        },
      ],
      null,
      2,
    ),
  );
}

function createLookupService(): ProductRegistrationLookupService {
  writeTestDataset();
  return new ProductRegistrationLookupService(datasetPath);
}

afterEach(() => {
  if (fs.existsSync(datasetPath)) {
    fs.unlinkSync(datasetPath);
  }
});

describe('ProductRegistrationLookupService priority by registration number', () => {
  it('matches by registration number before name fallback', () => {
    const service = createLookupService();
    const result = service.findProductByRegistration({
      registrationNumber: 'Reg. n. 12096 del 21-04-2004',
      productName: 'POLTIGLIA DISPERS DA KG 15',
    });
    expect(result).not.toBeNull();
    expect(result?.registrationNumber).toBe('012096');
  });

  it('falls back to name when registration is incompatible with product name', () => {
    const service = createLookupService();
    const enriched = service.enrichProductsWithRegistration([
      {
        productName: 'CHALLENGE DA LT 5',
        registrationNumber: 'Reg. n. 12096 del 21-04-2004',
        administrativeStatus: null,
      },
    ]);
    expect(enriched[0]?.registrationNumber).toBe('08184');
  });
});

describe('ProductRegistrationLookupService fuzzy matching safeguards', () => {
  it('does not match short unrelated names via accidental suffix overlap', () => {
    const service = createLookupService();
    expect(service.findProduct('ph one')).toBeNull();
  });

  it('does not match a single significant word against a multi-word dataset entry', () => {
    const service = createLookupService();
    expect(service.findProduct('one')).toBeNull();
    expect(service.findProduct('agroxone')).not.toBeNull();
  });

  it('rejects perfect word-overlap matches without containment between distinct products', () => {
    const service = createLookupService();
    expect(service.findProduct('ZAMPIRO 25 FORTE')?.registrationNumber).toBe('020025');
    expect(service.findProduct('ZAMPIRO 50 FORTE')).toBeNull();
  });

  it('still matches a name that is fully contained in a dataset entry', () => {
    const service = createLookupService();
    const result = service.findProduct('POLTIGLIA DISPERS DA KG 15');
    expect(result?.registrationNumber).toBe('012096');
  });
});

describe('Classifier priority flow', () => {
  it('classifies DDT entry as phytosanitary using provided registration', () => {
    const lookupService = createLookupService();
    const classifier = new DdtProductClassifier({ registrationLookupService: lookupService });
    const entries = classifier.execute({
      entries: [
        {
          productName: 'POLTIGLIA DISPERS DA KG 15',
          registrationNumber: 'Reg. n. 12096 del 21-04-2004',
          quantity: 60,
          quantityUnitOfMeasure: 'KG',
          supplierName: null,
          supplierVat: null,
          ddtDate: null,
          orderNumber: null,
        },
      ],
    });
    expect(entries[0]?.productCategory).toBe('PHYTOSANITARY');
    expect(entries[0]?.registrationNumber).toBe('012096');
  });

  it('does not classify a short unrelated product name as phytosanitary via fuzzy matching', () => {
    const lookupService = createLookupService();
    const classifier = new InvoiceProductClassifier({ registrationLookupService: lookupService });
    const entries = classifier.execute({
      entries: [
        {
          productName: 'ph one',
          registrationNumber: null,
          quantity: 1,
          quantityUnitOfMeasure: 'LT',
          supplierName: null,
          supplierVat: null,
          invoiceNumber: null,
          invoiceDate: null,
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
      ],
    });
    expect(entries[0]?.productCategory).not.toBe('PHYTOSANITARY');
    expect(entries[0]?.registrationNumber).toBeNull();
    expect(entries[0]?.administrativeStatus).toBeNull();
  });

  it('classifies invoice entry as phytosanitary using registration extracted from product text', () => {
    const lookupService = createLookupService();
    const classifier = new InvoiceProductClassifier({ registrationLookupService: lookupService });
    const entries = classifier.execute({
      entries: [
        {
          productName: 'CHALLENGE reg.08184 LT.5-clp',
          registrationNumber: null,
          quantity: 10,
          quantityUnitOfMeasure: 'LT',
          supplierName: null,
          supplierVat: null,
          invoiceNumber: null,
          invoiceDate: null,
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
      ],
    });
    expect(entries[0]?.productCategory).toBe('PHYTOSANITARY');
    expect(entries[0]?.registrationNumber).toBe('08184');
    expect(entries[0]?.administrativeStatus).toBe('Revocato');
  });
});
