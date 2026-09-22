import { type AgriculturalExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { normalizeExtractedField } from './field-normalizer';
import { FieldCsvAgent } from '../agents/file_agent/field_csv_agent';
import { ProductionUnitCsvAgent } from '../agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../agents/file_agent/piano_colturale_pdf_agent';
import { parsePcgGeojson } from '../pcg-geojson-parser';
import { isVenetoPcgZip, parseVenetoPcgZip } from './veneto-pcg/veneto-pcg-zip-parser';
import { mapGeoShapeRowsToRawUnits } from './map-geo-shape-rows-to-raw-units';
import { MulterFileInput, parseShapefileUploadOrZipTables } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractAgricultural(this: BatchExtractionOrchestratorContext, file: MulterFileInput, fileFormat: string, companyId: string, onProgress: (progress: number) => void): Promise<AgriculturalExtractionData> {
    if (fileFormat === 'pdf') {
      const pdfAgent = new PianoColturalePdfAgent();
      const result = await pdfAgent.extractFromPdf(file.buffer, (completed, total) => {
        onProgress(10 + Math.round(((completed + 1) / total) * 80));
      });
      const fields = result.fields.fields.map((f) => normalizeExtractedField(f, companyId));
      const productionUnits = await this.buildPuPreviews(result.productionUnits.units, companyId);
      return {
        fields,
        productionUnits,
        extractedCount: fields.length + productionUnits.length,
        diagnostics: result.fields.diagnostics,
      };
    }
    if (fileFormat === 'geojson') {
      onProgress(20);
      const geoResult = await parsePcgGeojson(file.buffer);
      onProgress(60);
      const fields = geoResult.fields.map((f) => normalizeExtractedField(f, companyId));
      const rawUnits = mapGeoShapeRowsToRawUnits(
        geoResult.fields,
        geoResult.productionUnits.map((pu) => ({
          name: pu.name,
          cropName: pu.cropName,
          cropType: pu.cropType,
          variety: pu.variety,
          protocoll: pu.protocoll,
          protectionStructure: pu.protectionStructure,
          startDate: pu.startDate,
          endDate: pu.endDate,
          areaHa: pu.areaHa,
          fieldIndex: pu.fieldIndex,
          destinazioneDiUso: pu.destinazioneDiUso,
        })),
      );
      const productionUnits = await this.buildPuPreviews(rawUnits, companyId);
      onProgress(90);
      return {
        fields,
        productionUnits,
        extractedCount: fields.length + productionUnits.length,
        diagnostics: geoResult.diagnostics,
      };
    }
    if (fileFormat === 'shapefile') {
      onProgress(20);
      if (isVenetoPcgZip(file.buffer)) {
        const venetoPcgResult = await parseVenetoPcgZip(file.buffer);
        onProgress(90);
        const fields = venetoPcgResult.fields.map((field) =>
          normalizeExtractedField(field, companyId),
        );
        return {
          fields,
          productionUnits: venetoPcgResult.productionUnits,
          extractedCount: fields.length + venetoPcgResult.productionUnits.length,
          diagnostics: venetoPcgResult.diagnostics,
        };
      }
      const shapeResult = await parseShapefileUploadOrZipTables(file);
      onProgress(60);
      const extractedFields =
        'fieldsResult' in shapeResult ? shapeResult.fieldsResult.fields : shapeResult.fields;
      const fields = extractedFields.map((field) => normalizeExtractedField(field, companyId));
      const rawUnits =
        'productionUnitResult' in shapeResult
          ? shapeResult.productionUnitResult.units
          : mapGeoShapeRowsToRawUnits(
              shapeResult.fields,
              shapeResult.productionUnits.map((pu) => ({
                name: pu.name,
                cropName: pu.cropName,
                cropType: pu.cropType,
                variety: pu.variety,
                protocoll: pu.protocoll,
                protectionStructure: pu.protectionStructure,
                startDate: pu.startDate,
                endDate: pu.endDate,
                areaHa: pu.areaHa,
                fieldIndex: pu.fieldIndex,
                destinazioneDiUso: pu.destinazioneDiUso,
              })),
            );
      const productionUnits = await this.buildPuPreviews(rawUnits, companyId);
      onProgress(90);
      return {
        fields,
        productionUnits,
        extractedCount: fields.length + productionUnits.length,
        diagnostics: shapeResult.diagnostics,
      };
    }
    const fieldAgent = new FieldCsvAgent();
    const fieldResult = await fieldAgent.extractFieldsFromCsv(file.buffer);
    onProgress(40);
    const puAgent = new ProductionUnitCsvAgent();
    const puResult = await puAgent.extractProductionUnitsFromCsv(file.buffer);
    onProgress(70);
    const fields = fieldResult.fields.map((f) => normalizeExtractedField(f, companyId));
    const productionUnits = await this.buildPuPreviews(puResult.units, companyId);
    return {
      fields,
      productionUnits,
      extractedCount: fields.length + productionUnits.length,
      diagnostics: fieldResult.diagnostics,
    };
  }
