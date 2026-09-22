import { createDiagnostics, validateColumnMapping } from '../file_agent/utils/csv_parser';
import { isLombardiaFormat } from '../file_agent/template/lombardia_file_structure';
import { isPiemonteFormat } from '../file_agent/template/piemonte_file_structure';
import { isEmiliaRomagnaFormat } from '../file_agent/template/emilia_romagna_file_structure';
import { isVenetoFormat, isVenetoAVEPAFormat } from '../file_agent/template/veneto_file_structure';
import { isCiaSchedarioViticoloFormat } from '../file_agent/template/cia_schedario_viticolo_file_structure';
import { detectAndExtractHeaders, convertToParseResult } from '../file_agent/utils/header_detector';
import { ProductionUnitExtractionResult } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractProductionUnitsFromCsv(this: ProductionUnitCsvAgentContext, fileBuffer: Buffer): Promise<ProductionUnitExtractionResult> {
    // Step 0: Try advanced header detection for complex files (multi-row headers, offset rows)
    const detection = detectAndExtractHeaders(fileBuffer);

    // If we detected a known format with the advanced detector, use it
    if (detection.detectedFormat !== 'unknown' && detection.headers.length > 0) {
      console.log(
        `ProductionUnitCsvAgent: Advanced detection found ${detection.detectedFormat} format ` +
          `(headers at row ${detection.headerStartRow}, ${detection.headerRowCount} header rows, ` +
          `${detection.rawRows.length} data rows)`,
      );

      const { rows } = convertToParseResult(detection);

      if (rows.length === 0) {
        return {
          units: [],
          diagnostics: createDiagnostics(0, detection.detectedFormat),
        };
      }

      const format = detection.detectedFormat;

      // Use the appropriate regional parser based on detected format
      if (format === 'lombardia') {
        console.log('ProductionUnitCsvAgent: Using Lombardia format parser (advanced detection)');
        const units = await this.extractLombardiaFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'LOMBARDIA') };
      }

      if (format === 'piemonte') {
        console.log('ProductionUnitCsvAgent: Using Piemonte format parser (advanced detection)');
        const units = await this.extractPiemonteFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'PIEMONTE') };
      }

      if (format === 'emilia_romagna') {
        console.log(
          'ProductionUnitCsvAgent: Using Emilia-Romagna format parser (advanced detection)',
        );
        const units = await this.extractEmiliaRomagnaFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'EMILIA_ROMAGNA') };
      }

      if (format === 'veneto') {
        console.log(
          'ProductionUnitCsvAgent: Using Veneto Standard format parser (advanced detection)',
        );
        const units = await this.extractVenetoStandardFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'VENETO') };
      }

      if (format === 'veneto_avepa') {
        console.log(
          'ProductionUnitCsvAgent: Using Veneto AVEPA Piano Utilizzo format parser (advanced detection)',
        );
        const units = await this.extractVenetoAVEPAFormat(rows, detection.headers);
        return { units, diagnostics: createDiagnostics(rows.length, 'VENETO_AVEPA') };
      }

      if (format === 'cia_schedario_viticolo') {
        console.log(
          'ProductionUnitCsvAgent: Using CIA Schedario Viticolo format parser (advanced detection)',
        );
        const units = await this.extractCiaSchedarioViticoloFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'CIA_SCHEDARIO_VITICOLO') };
      }
    }

    // Fallback to original parsing for simple CSV files
    const csvContent = this.bufferToCsv(fileBuffer);
    if (!csvContent.trim()) {
      throw new Error('CSV file is empty');
    }

    // Step 1: Parse CSV
    const { headers, rows } = this.parseCsv(csvContent);
    if (rows.length === 0) {
      return { units: [], diagnostics: createDiagnostics(0, 'UNKNOWN') };
    }

    // Step 1.5: Check for known regional formats (no LLM needed for column mapping)
    if (isLombardiaFormat(headers)) {
      console.log('ProductionUnitCsvAgent: Detected Lombardia format, using deterministic parser');
      const units = await this.extractLombardiaFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'LOMBARDIA') };
    }

    if (isPiemonteFormat(headers)) {
      console.log('ProductionUnitCsvAgent: Detected Piemonte format, using deterministic parser');
      const units = await this.extractPiemonteFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'PIEMONTE') };
    }

    if (isEmiliaRomagnaFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected Emilia-Romagna format, using deterministic parser',
      );
      const units = await this.extractEmiliaRomagnaFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'EMILIA_ROMAGNA') };
    }

    if (isVenetoAVEPAFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected Veneto AVEPA format, using deterministic parser',
      );
      const units = await this.extractVenetoAVEPAFormat(rows, headers);
      return { units, diagnostics: createDiagnostics(rows.length, 'VENETO_AVEPA') };
    }

    if (isVenetoFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected Veneto Standard format, using deterministic parser',
      );
      const units = await this.extractVenetoStandardFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'VENETO') };
    }

    if (isCiaSchedarioViticoloFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected CIA Schedario Viticolo format, using deterministic parser',
      );
      const units = await this.extractCiaSchedarioViticoloFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'CIA_SCHEDARIO_VITICOLO') };
    }

    // Step 2: Get column mapping from LLM
    const mapping = await this.getColumnMapping(headers, rows.slice(0, 10));

    // Step 2.5: Validate LLM column mapping against actual headers
    const { columns: validatedColumns, warnings: mappingWarnings } = validateColumnMapping(
      mapping.columns,
      headers,
    );
    mapping.columns = validatedColumns as typeof mapping.columns;
    if (mappingWarnings.length > 0) {
      console.warn(`ProductionUnitCsvAgent: Column mapping warnings:`, mappingWarnings);
    }

    const diagnostics = createDiagnostics(rows.length, `LLM_${mapping.format}`);
    diagnostics.warnings.push(...mappingWarnings);

    // Step 3: Collect unique crop+variety combinations for batch identification
    const cropInputs = this.collectUniqueCropInputs(rows, mapping);

    // Step 4: Identify all crops with LLM in batch (with fallback to raw names)
    try {
      await this.identifyCropsWithLLM(cropInputs);
    } catch (error) {
      console.warn(
        'ProductionUnitCsvAgent: Crop identification LLM failed, using raw names as fallback:',
        error instanceof Error ? error.message : String(error),
      );
      diagnostics.warnings.push('Identificazione colture LLM fallita, usati nomi originali');
      for (const input of cropInputs) {
        const cacheKey = this.buildCropCacheKey(input.cropName, input.variety);
        if (!this.cropCache.has(cacheKey)) {
          this.cropCache.set(cacheKey, {
            species: input.cropName,
            cropType: input.cropName,
            code: null,
            variety: input.variety,
          });
        }
      }
    }

    // Step 5: Extract based on format (now with crop info from cache)
    const units =
      mapping.format === 'AGEA'
        ? this.extractAgeaFormat(rows, mapping)
        : this.extractLegacyFormat(rows, mapping);

    diagnostics.extractedRows = units.length;

    // Step 6: If deterministic extraction produced 0 results, try LLM full extraction fallback
    if (units.length === 0 && rows.length > 0) {
      console.warn(
        'ProductionUnitCsvAgent: Deterministic parsing produced 0 results, falling back to LLM full extraction',
      );
      diagnostics.warnings.push(
        'Parsing deterministico ha prodotto 0 risultati, tentativo estrazione LLM completa',
      );
      diagnostics.detectedFormat = 'LLM_FULL_EXTRACTION';
      const llmUnits = await this.extractProductionUnitsWithLLM(csvContent);
      diagnostics.extractedRows = llmUnits.length;
      return { units: llmUnits, diagnostics };
    }

    return { units, diagnostics };
  }
