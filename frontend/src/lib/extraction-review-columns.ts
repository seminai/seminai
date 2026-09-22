import type { EditableExtractionColumn } from '@/components/molecules/editable-extraction-column-menu';
import type { FieldBulkPreview, ProductionUnitPreview, StockPreviewEntry } from '@/types/extraction';

export const fieldExtractionColumns = [
  { id: 'name', label: 'Nome', defaultVisible: true },
  { id: 'foglio', label: 'Foglio', defaultVisible: true },
  { id: 'particella', label: 'Particella', defaultVisible: true },
  { id: 'city', label: 'Comune', defaultVisible: true },
  { id: 'sauHa', label: 'Superficie SUA (ha)', defaultVisible: true },
  { id: 'superficieCatastaleMq', label: 'Superficie (mq)', defaultVisible: true },
  { id: 'uso', label: 'Coltura', defaultVisible: true },
  { id: 'gisHa', label: 'GIS (ha)', defaultVisible: false },
  { id: 'sezione', label: 'Sezione', defaultVisible: false },
  { id: 'subalterno', label: 'Subalterno', defaultVisible: false },
  { id: 'region', label: 'Regione', defaultVisible: false },
  { id: 'qualita', label: 'Qualità', defaultVisible: false },
  { id: 'soilType', label: 'Tipo suolo', defaultVisible: false },
  { id: 'address', label: 'Indirizzo', defaultVisible: false },
  { id: 'cap', label: 'CAP', defaultVisible: false },
  { id: 'inizioConduzione', label: 'Inizio conduzione', defaultVisible: true },
  { id: 'fineConduzione', label: 'Fine conduzione', defaultVisible: true },
  { id: 'latitude', label: 'Latitudine', defaultVisible: false },
  { id: 'longitude', label: 'Longitudine', defaultVisible: false },
] as const satisfies readonly EditableExtractionColumn[];

export const productionUnitExtractionColumns = [
  { id: 'name', label: 'Nome', defaultVisible: true },
  { id: 'cropName', label: 'Coltura', defaultVisible: true },
  { id: 'cycles', label: 'Cicli', defaultVisible: true, readOnly: true },
  { id: 'variety', label: 'Varietà', defaultVisible: true },
  { id: 'areaHa', label: 'Area (ha)', defaultVisible: true },
  { id: 'startDate', label: 'Inizio', defaultVisible: true },
  { id: 'cropType', label: 'Tipo coltura', defaultVisible: false },
  { id: 'protocoll', label: 'Protocollo', defaultVisible: false },
  { id: 'protectionStructure', label: 'Struttura protetta', defaultVisible: false },
  { id: 'endDate', label: 'Fine', defaultVisible: false },
] as const satisfies readonly EditableExtractionColumn[];

export const stockExtractionColumns = [
  { id: 'name', label: 'Prodotto', defaultVisible: true },
  { id: 'quantity', label: 'Quantità', defaultVisible: true },
  { id: 'unitOfMeasureQuantity', label: 'UDM', defaultVisible: true },
  { id: 'price', label: 'Prezzo Tot.', defaultVisible: true },
  { id: 'category', label: 'Categoria', defaultVisible: false },
  { id: 'registrationNumber', label: 'N. registrazione', defaultVisible: false },
  { id: 'type', label: 'Movimento', defaultVisible: false },
  { id: 'ddtCode', label: 'Codice DDT', defaultVisible: false },
  { id: 'ddtDate', label: 'Data DDT', defaultVisible: false },
  { id: 'invoiceCode', label: 'Codice fattura', defaultVisible: false },
  { id: 'companySupplierName', label: 'Fornitore', defaultVisible: false },
] as const satisfies readonly EditableExtractionColumn[];

export function toFieldExtractionRows(fields: readonly FieldBulkPreview[]): string[][] {
  return fields.map((field) => [
    textValue(field.name),
    textValue(field.foglio),
    textValue(field.particella),
    textValue(field.city),
    numberValue(field.sauHa),
    numberValue(field.superficieCatastaleMq),
    textValue(field.uso),
    numberValue(field.gisHa),
    textValue(field.sezione),
    textValue(field.subalterno),
    textValue(field.region),
    textValue(field.qualita),
    textValue(field.soilType),
    textValue(field.address),
    textValue(field.cap),
    textValue(field.inizioConduzione),
    textValue(field.fineConduzione),
    numberValue(field.latitude),
    numberValue(field.longitude),
  ]);
}

export function toProductionUnitExtractionRows(productionUnits: readonly ProductionUnitPreview[]): string[][] {
  return productionUnits.map((productionUnit) => [
    textValue(productionUnit.name),
    textValue(productionUnit.cropName),
    formatCycles(productionUnit),
    textValue(productionUnit.variety),
    numberValue(productionUnit.areaHa),
    textValue(productionUnit.startDate),
    textValue(productionUnit.cropType),
    textValue(productionUnit.protocoll),
    textValue(productionUnit.protectionStructure),
    textValue(productionUnit.endDate),
  ]);
}

export function toStockExtractionRows(entries: readonly StockPreviewEntry[]): string[][] {
  return entries.map((entry) => [
    textValue(entry.name),
    numberValue(entry.stock.quantity),
    textValue(entry.stock.unitOfMeasureQuantity),
    numberValue(entry.stock.price),
    textValue(entry.category),
    textValue(entry.registrationNumber),
    textValue(entry.stock.type),
    textValue(entry.stock.ddtCode),
    textValue(entry.stock.ddtDate),
    textValue(entry.stock.invoiceCode),
    textValue(entry.stock.companySupplierName),
  ]);
}

function textValue(value: string | null | undefined): string {
  return value ?? '';
}

function numberValue(value: number | null | undefined): string {
  return value == null ? '' : value.toString();
}

function formatCycles(productionUnit: ProductionUnitPreview): string {
  const cycles = productionUnit.cycles ?? [];
  if (cycles.length === 0) return textValue(productionUnit.cropName);
  return cycles
    .map((cycle) => {
      const crop = cycle.cropName ?? 'Coltura';
      const variety = cycle.variety ? ` (${cycle.variety})` : '';
      return `${cycle.cycleIndex}: ${crop}${variety}`;
    })
    .join(' | ');
}
