/**
 * CSV/Excel file extraction logic for extract_from_file tool.
 * Handles: agricultural templates → fields/production units; warehouse CSVs → stock movements.
 */
import { updateWorkingMemory } from '../working-memory';
import { CompanyDataExtractorAgent } from '../../company/company_data_extractor_agent';
import { ImportProductsFromCsvExcelUseCase } from '../../../../../application/use-cases/product/ImportProductsFromCsvExcelUseCase';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../../../repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../../../../repositories/PrismaWarehouseRepository';
import { prisma } from '../../../../repositories/Prisma';
import { detectCsvExcelType } from './file-type-detector';
import type {
  StockPreviewEntry,
  FieldExtracted,
  ProductionUnitExtracted,
  CompanyExtracted,
} from './file-extraction-types';

export async function handleCsvExcelFile(
  threadId: string,
  fileBuffer: Buffer,
  fileName: string,
  extractionType: string,
  forceStock: boolean,
): Promise<string> {
  const detection = detectCsvExcelType(fileBuffer);

  if (forceStock || detection.type === 'warehouse_stock') {
    return extractWarehouseStock(
      threadId,
      fileBuffer,
      fileName,
      forceStock ? 'Forced by user' : detection.reason,
    );
  }

  return extractAgriculturalCsv(threadId, fileBuffer, fileName, extractionType, detection.reason);
}

async function extractAgriculturalCsv(
  threadId: string,
  fileBuffer: Buffer,
  fileName: string,
  extractionType: string,
  detectionReason: string,
): Promise<string> {
  const result = await new CompanyDataExtractorAgent().extractFromCsv(fileBuffer);
  let companies: CompanyExtracted[] = result.companies ?? [];
  let fields: FieldExtracted[] = result.fields ?? [];
  let productionUnits: ProductionUnitExtracted[] = result.productionUnits ?? [];

  if (extractionType === 'company') {
    fields = [];
    productionUnits = [];
  } else if (extractionType === 'fields') {
    companies = [];
    productionUnits = [];
  } else if (extractionType === 'production_units') {
    companies = [];
    fields = [];
  }

  updateWorkingMemory(threadId, {
    extractedFileData: { companies, fields, productionUnits },
    detectedFileType: 'agricultural',
  });

  const aziende = companies.map((c, i) => ({
    n: i + 1,
    nome: c.name ?? 'N/A',
    partitaIva: c.vatNumber ?? '',
    codiceFiscale: c.fiscalCode ?? '',
    comune: c.city ?? '',
  }));

  const campi = fields.map((f, i) => ({
    n: i + 1,
    nome: f.nome || f.name || `F${f.foglio ?? '?'} P${f.particella ?? '?'}`,
    foglio: f.foglio ?? '?',
    particella: f.particella ?? '?',
    sezione: f.sezione ?? '',
    superficieHa: f.superficieCatastaleHa ?? f.sauHa ?? null,
    comune: f.comune ?? 'N/A',
    uso: f.usiSuolo?.join(', ') ?? f.qualita ?? '',
  }));

  const unitaProduttive = productionUnits.map((pu, i) => {
    const cycle = pu.cycles?.[0];
    const campo =
      pu.foglio && pu.particella
        ? `F${pu.foglio} P${pu.particella}`
        : pu.allocations?.[0]
          ? `F${pu.allocations[0].foglio ?? '?'} P${pu.allocations[0].particella ?? '?'}`
          : 'N/A';
    return {
      n: i + 1,
      nome: pu.name || 'N/A',
      coltura: cycle?.cropName ?? 'N/A',
      varieta: cycle?.variety ?? '',
      superficieHa: pu.areaHa ?? null,
      campoAssociato: campo,
      dataInizio: pu.startDate || cycle?.startDate || 'N/A',
      dataFine: pu.endDate || cycle?.endDate || 'N/A',
    };
  });

  return JSON.stringify({
    source: 'CSV/Excel (Dati agricoli)',
    detectedFileType: 'agricultural',
    detectionReason,
    fileName,
    companiesExtracted: companies.length,
    fieldsExtracted: fields.length,
    productionUnitsExtracted: productionUnits.length,
    aziende: aziende.length > 0 ? aziende : undefined,
    campi,
    unitaProduttive,
    workingMemoryKey: 'extractedFileData',
    importTool: 'import_from_file',
    message: `Estratti ${companies.length} aziende, ${fields.length} campi, ${productionUnits.length} unità produttive da "${fileName}". Presenta i campi in tabella e chiedi conferma prima di procedere.`,
  });
}

async function extractWarehouseStock(
  threadId: string,
  fileBuffer: Buffer,
  fileName: string,
  detectionReason: string,
): Promise<string> {
  const useCase = new ImportProductsFromCsvExcelUseCase(
    new PrismaProductRepository(prisma),
    new PrismaStockRepository(prisma),
    new PrismaWarehouseRepository(prisma),
  );

  const result = await useCase.execute({
    companyId: 'preview-placeholder',
    fileBuffer,
    fileName,
    preview: true,
  });

  const stockEntries: StockPreviewEntry[] = (result.previewProducts ?? []).map((p) => ({
    name: p.name,
    category: p.category,
    registrationNumber: p.registrationNumber,
    stock: {
      quantity: p.stock.quantity,
      unitOfMeasureQuantity: p.stock.unitOfMeasureQuantity,
      price: p.stock.price,
      type: p.stock.type,
      ddtCode: p.stock.ddtCode,
      ddtDate: p.stock.ddtDate,
      invoiceCode: p.stock.invoiceCode,
      companySupplierName: p.stock.companySupplierName,
    },
  }));

  updateWorkingMemory(threadId, {
    extractedStockData: stockEntries,
    detectedFileType: 'warehouse_stock',
  });

  const preview = stockEntries
    .slice(0, 10)
    .map(
      (s) =>
        `${s.name} - ${s.stock.quantity} ${s.stock.unitOfMeasureQuantity} (${s.stock.companySupplierName ?? 'N/A'})`,
    );

  return JSON.stringify({
    source: 'CSV/Excel (Magazzino)',
    detectedFileType: 'warehouse_stock',
    detectionReason,
    fileName,
    productsExtracted: stockEntries.length,
    errors: result.errors.length > 0 ? result.errors.slice(0, 5) : undefined,
    preview: { products: preview },
    workingMemoryKey: 'extractedStockData',
    importTool: 'import_stock_from_file',
    message: `Estratti ${stockEntries.length} prodotti/movimenti da "${fileName}" (Magazzino). Usa import_stock_from_file per importarli.`,
  });
}
