import AdmZip from 'adm-zip';
import {
  FieldCsvAgent,
  type ExtractedFieldData,
} from '../../../infrastructure/services/agents/file_agent/field_csv_agent';
import {
  ProductionUnitCsvAgent,
  type ProductionUnitRaw,
} from '../../../infrastructure/services/agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../../../infrastructure/services/agents/file_agent/piano_colturale_pdf_agent';
import { parseShapefile } from '../../../infrastructure/services/shapefile-parser';
import { parsePcgGeojson } from '../../../infrastructure/services/pcg-geojson-parser';

export type ExtractionPhase =
  | 'validating'
  | 'parsing_pdf'
  | 'parsing_csv'
  | 'parsing_shapefile'
  | 'parsing_geojson'
  | 'extracting_fields'
  | 'extracting_production_units'
  | 'finalizing'
  | 'completed';

export type ProgressCallback = (phase: ExtractionPhase, progress: number, message: string) => void;

type FieldPreviewBase = ExtractedFieldData['fields'][number];

export interface FieldPreview extends FieldPreviewBase {
  sourceFileId?: string | null;
  coordinates?: number[];
  coordinatesGaussBoaga?: number[];
  polygon?: unknown;
  polygonGaussBoaga?: unknown;
}

export interface ProductionUnitPreview {
  name: string;
  cropName: string | null;
  cropType: string | null;
  variety: string | null;
  protocoll: string | null;
  protectionStructure: string | null;
  startDate: string | null;
  endDate: string | null;
  floweringDate: string | null;
  harvestingDate: string | null;
  occupazione: string | null;
  destinazioneDiUso: string | null;
  areaHa: number | null;
  cycles: ProductionUnitRaw['cycles'];
  fieldAllocations: ProductionUnitRaw['allocations'];
}

export interface ExtractionResult {
  fields: FieldPreview[];
  productionUnits: ProductionUnitPreview[];
  fieldCount: number;
  productionUnitCount: number;
}

export interface ExtractFromFileInput {
  readonly fileBuffer: Buffer;
  readonly originalName: string;
  readonly mimeType: string;
  readonly onProgress?: ProgressCallback;
}

/**
 * Extracts fields and production units from a file (PDF, CSV/Excel, Shapefile ZIP).
 * This use-case is shared between the sync endpoint and the async worker.
 */
export class ExtractFromFileUseCase {
  async execute(input: ExtractFromFileInput): Promise<ExtractionResult> {
    const { fileBuffer, originalName, mimeType, onProgress } = input;
    const report = onProgress ?? (() => {});

    report('validating', 5, 'Validazione file in corso...');

    const isPdf = mimeType === 'application/pdf' || originalName?.toLowerCase().endsWith('.pdf');
    const isGeojson =
      mimeType === 'application/geo+json' ||
      originalName?.toLowerCase().endsWith('.geojson') ||
      (originalName?.toLowerCase().startsWith('pcg_') &&
        originalName?.toLowerCase().endsWith('.json'));
    const shapefileBuffers = this.extractShapefileFromZip(fileBuffer);
    const isShapefile = shapefileBuffers !== null;

    let fields: FieldPreview[];
    let productionUnits: ProductionUnitPreview[];

    if (isPdf) {
      fields = [];
      productionUnits = [];
      report('parsing_pdf', 10, 'Estrazione testo dal PDF...');

      const pdfAgent = new PianoColturalePdfAgent();
      const pdfResult = await pdfAgent.extractFromPdf(fileBuffer, (chunkIdx, totalChunks) => {
        const chunkProgress = 10 + Math.round(((chunkIdx + 1) / totalChunks) * 50);
        report('parsing_pdf', chunkProgress, `Analisi chunk ${chunkIdx + 1}/${totalChunks}...`);
      });

      report('extracting_fields', 65, 'Elaborazione campi...');
      fields = pdfResult.fields.fields;

      report('extracting_production_units', 80, 'Elaborazione unità produttive...');
      productionUnits = pdfResult.productionUnits.units.map((pu) => ({
        name: pu.name,
        cropName: pu.cycles[0]?.cropName ?? null,
        cropType: pu.cycles[0]?.cropType ?? null,
        variety: pu.cycles[0]?.variety ?? null,
        protocoll: pu.protocoll,
        protectionStructure: pu.cycles[0]?.protectionStructure ?? null,
        startDate: pu.startDate,
        endDate: pu.endDate,
        floweringDate: pu.cycles[0]?.floweringDate ?? null,
        harvestingDate: pu.cycles[0]?.harvestingDate ?? null,
        occupazione: pu.cycles[0]?.occupazione ?? null,
        destinazioneDiUso: pu.cycles[0]?.destinazione ?? null,
        areaHa: pu.areaHa,
        cycles: pu.cycles,
        fieldAllocations: pu.allocations,
      }));
    } else if (isShapefile) {
      report('parsing_shapefile', 10, 'Parsing shapefile...');

      const shpResult = await parseShapefile(shapefileBuffers.shp, shapefileBuffers.dbf);

      report('extracting_fields', 50, 'Elaborazione campi da shapefile...');
      fields = shpResult.fields.map((f) => ({
        name: f.name,
        nation: f.nation,
        region: f.region,
        city: f.city,
        address: f.address,
        cap: f.cap,
        foglio: f.foglio ?? '',
        particella: f.particella ?? '',
        subalterno: f.subalterno,
        sezione: f.sezione,
        superficieCatastaleMq: f.superficieCatastaleMq,
        gisHa: f.gisHa,
        sauHa: f.sauHa,
        variazioneMq: f.variazioneMq,
        uso: f.uso,
        qualita: f.qualita,
        soilType: f.soilType,
        ph: f.ph,
        nitrogen: f.nitrogen,
        phosphorus: f.phosphorus,
        potassium: f.potassium,
        calcium: f.calcium,
        magnesium: f.magnesium,
        latitude: f.latitude,
        longitude: f.longitude,
        coordinates: f.coordinates,
        coordinatesGaussBoaga: f.coordinatesGaussBoaga,
        polygon: f.polygon,
        polygonGaussBoaga: f.polygonGaussBoaga,
        inizioConduzione: f.inizioConduzione,
        fineConduzione: f.fineConduzione,
      }));

      report('extracting_production_units', 80, 'Elaborazione unità produttive...');
      productionUnits = shpResult.productionUnits.map((pu) => ({
        name: pu.name,
        cropName: pu.cropName,
        cropType: pu.cropType,
        variety: pu.variety,
        protocoll: pu.protocoll,
        protectionStructure: pu.protectionStructure,
        startDate: pu.startDate,
        endDate: pu.endDate,
        floweringDate: null,
        harvestingDate: null,
        occupazione: null,
        destinazioneDiUso: pu.destinazioneDiUso,
        areaHa: pu.areaHa,
        cycles: [],
        fieldAllocations: [],
      }));
    } else if (isGeojson) {
      report('parsing_geojson', 10, 'Parsing PCG GeoJSON...');
      const geoResult = await parsePcgGeojson(fileBuffer);
      report('extracting_fields', 50, 'Elaborazione campi da PCG GeoJSON...');
      fields = geoResult.fields.map((f) => ({
        name: f.name,
        nation: f.nation,
        region: f.region,
        city: f.city,
        address: f.address,
        cap: f.cap,
        foglio: f.foglio ?? '',
        particella: f.particella ?? '',
        subalterno: f.subalterno,
        sezione: f.sezione,
        superficieCatastaleMq: f.superficieCatastaleMq,
        gisHa: f.gisHa,
        sauHa: f.sauHa,
        variazioneMq: f.variazioneMq,
        uso: f.uso,
        qualita: f.qualita,
        soilType: f.soilType,
        ph: f.ph,
        nitrogen: f.nitrogen,
        phosphorus: f.phosphorus,
        potassium: f.potassium,
        calcium: f.calcium,
        magnesium: f.magnesium,
        latitude: f.latitude,
        longitude: f.longitude,
        coordinates: f.coordinates,
        coordinatesGaussBoaga: f.coordinatesGaussBoaga,
        polygon: f.polygon,
        polygonGaussBoaga: f.polygonGaussBoaga,
        inizioConduzione: f.inizioConduzione,
        fineConduzione: f.fineConduzione,
      }));
      report('extracting_production_units', 80, 'Elaborazione unità produttive...');
      productionUnits = geoResult.productionUnits.map((pu) => ({
        name: pu.name,
        cropName: pu.cropName,
        cropType: pu.cropType,
        variety: pu.variety,
        protocoll: pu.protocoll,
        protectionStructure: pu.protectionStructure,
        startDate: pu.startDate,
        endDate: pu.endDate,
        floweringDate: null,
        harvestingDate: null,
        occupazione: null,
        destinazioneDiUso: pu.destinazioneDiUso,
        areaHa: pu.areaHa,
        cycles: [],
        fieldAllocations: [],
      }));
    } else {
      report('parsing_csv', 10, 'Parsing CSV/Excel...');
      const fieldAgent = new FieldCsvAgent();
      const puAgent = new ProductionUnitCsvAgent();
      report('extracting_fields', 20, 'Estrazione campi da CSV/Excel...');
      const [fieldResult, puExtractionResult] = await Promise.all([
        fieldAgent.extractFieldsFromCsv(fileBuffer),
        puAgent.extractProductionUnitsFromCsv(fileBuffer),
      ]);
      report('extracting_production_units', 70, 'Elaborazione unità produttive...');
      fields = fieldResult.fields;
      productionUnits = puExtractionResult.units.map((pu) => ({
        name: pu.name,
        cropName: pu.cycles[0]?.cropName ?? null,
        cropType: pu.cycles[0]?.cropType ?? null,
        variety: pu.cycles[0]?.variety ?? null,
        protocoll: pu.protocoll,
        protectionStructure: pu.cycles[0]?.protectionStructure ?? null,
        startDate: pu.startDate,
        endDate: pu.endDate,
        floweringDate: pu.cycles[0]?.floweringDate ?? null,
        harvestingDate: pu.cycles[0]?.harvestingDate ?? null,
        occupazione: pu.cycles[0]?.occupazione ?? null,
        destinazioneDiUso: pu.cycles[0]?.destinazione ?? null,
        areaHa: pu.areaHa,
        cycles: pu.cycles,
        fieldAllocations: pu.allocations,
      }));
    }
    report('finalizing', 95, 'Finalizzazione risultati...');
    const result: ExtractionResult = {
      fields,
      productionUnits,
      fieldCount: fields.length,
      productionUnitCount: productionUnits.length,
    };
    report(
      'completed',
      100,
      `Estratti ${result.fieldCount} campi e ${result.productionUnitCount} unità produttive`,
    );
    return result;
  }
  private extractShapefileFromZip(buffer: Buffer): { shp: Buffer; dbf: Buffer } | null {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return null;
    }
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      let shpEntry: AdmZip.IZipEntry | undefined;
      let dbfEntry: AdmZip.IZipEntry | undefined;
      for (const entry of entries) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith('.shp')) shpEntry = entry;
        if (name.endsWith('.dbf')) dbfEntry = entry;
      }
      if (!shpEntry || !dbfEntry) return null;
      return { shp: shpEntry.getData(), dbf: dbfEntry.getData() };
    } catch {
      return null;
    }
  }
}
