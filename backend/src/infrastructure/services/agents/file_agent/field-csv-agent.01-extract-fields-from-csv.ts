import { createDiagnostics, validateColumnMapping } from './utils/csv_parser';
import { isLombardiaFormat } from './template/lombardia_file_structure';
import { isEmiliaRomagnaFormat } from './template/emilia_romagna_file_structure';
import { isPiemonteFormat } from './template/piemonte_file_structure';
import { isVenetoFormat,
// AVEPA Piano Utilizzo format
isVenetoAVEPAFormat } from './template/veneto_file_structure';
import { isCiaSchedarioViticoloFormat } from './template/cia_schedario_viticolo_file_structure';
import { detectAndExtractHeaders, convertToParseResult } from './utils/header_detector';
import { ExtractedFieldData } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export async function fieldCsvAgentExtractFieldsFromCsv(this: FieldCsvAgentContext, fileBuffer: Buffer): Promise<ExtractedFieldData> {
    // Step 0: Try advanced header detection for complex files (multi-row headers, offset rows)
    const detection = detectAndExtractHeaders(fileBuffer);

    // If we detected a known format with the advanced detector, use it
    if (detection.detectedFormat !== 'unknown' && detection.headers.length > 0) {
      console.log(
        `FieldCsvAgent: Advanced detection found ${detection.detectedFormat} format ` +
          `(headers at row ${detection.headerStartRow}, ${detection.headerRowCount} header rows, ` +
          `${detection.rawRows.length} data rows)`,
      );

      const { rows } = convertToParseResult(detection);

      if (rows.length === 0) {
        throw new Error('Nessuna riga dati trovata nel file');
      }

      // Use the appropriate regional parser based on detected format
      if (detection.detectedFormat === 'lombardia') {
        console.log('FieldCsvAgent: Using Lombardia format parser (advanced detection)');
        return this.extractFieldsLombardiaFormat(rows);
      }

      if (detection.detectedFormat === 'emilia_romagna') {
        console.log('FieldCsvAgent: Using Emilia-Romagna format parser (advanced detection)');
        return this.extractFieldsEmiliaRomagnaFormat(rows);
      }

      if (detection.detectedFormat === 'piemonte') {
        console.log('FieldCsvAgent: Using Piemonte format parser (advanced detection)');
        return this.extractFieldsPiemonteFormat(rows);
      }

      if (detection.detectedFormat === 'veneto') {
        console.log('FieldCsvAgent: Using Veneto format parser (advanced detection)');
        return this.extractFieldsVenetoFormat(rows);
      }

      if (detection.detectedFormat === 'veneto_avepa') {
        console.log(
          'FieldCsvAgent: Using Veneto AVEPA Piano Utilizzo format parser (advanced detection)',
        );
        return this.extractFieldsVenetoAVEPAFormat(rows, detection.headers);
      }

      if (detection.detectedFormat === 'cia_schedario_viticolo') {
        console.log(
          'FieldCsvAgent: Using CIA Schedario Viticolo format parser (advanced detection)',
        );
        return this.extractFieldsCiaSchedarioViticoloFormat(rows);
      }
    }

    // Fallback to original parsing for simple CSV files
    const csvContent = this.bufferToCsv(fileBuffer);

    if (!csvContent.trim()) {
      throw new Error('File CSV vuoto');
    }

    // Step 1: Parse CSV into headers and rows
    const { headers, rows } = this.parseCsv(csvContent);
    console.log(`FieldCsvAgent: Parsed ${rows.length} rows with ${headers.length} columns`);

    if (rows.length === 0) {
      throw new Error('Nessuna riga dati trovata nel CSV');
    }

    // Step 1.5: Check for known regional formats (no LLM needed)
    if (isLombardiaFormat(headers)) {
      console.log('FieldCsvAgent: Detected Lombardia format, using deterministic parser');
      return this.extractFieldsLombardiaFormat(rows);
    }

    if (isEmiliaRomagnaFormat(headers)) {
      console.log('FieldCsvAgent: Detected Emilia-Romagna format, using deterministic parser');
      return this.extractFieldsEmiliaRomagnaFormat(rows);
    }

    if (isPiemonteFormat(headers)) {
      console.log('FieldCsvAgent: Detected Piemonte format, using deterministic parser');
      return this.extractFieldsPiemonteFormat(rows);
    }

    if (isVenetoFormat(headers)) {
      console.log('FieldCsvAgent: Detected Veneto format, using deterministic parser');
      return this.extractFieldsVenetoFormat(rows);
    }

    if (isVenetoAVEPAFormat(headers)) {
      console.log('FieldCsvAgent: Detected Veneto AVEPA format, using deterministic parser');
      return this.extractFieldsVenetoAVEPAFormat(rows, headers);
    }

    if (isCiaSchedarioViticoloFormat(headers)) {
      console.log(
        'FieldCsvAgent: Detected CIA Schedario Viticolo format, using deterministic parser',
      );
      return this.extractFieldsCiaSchedarioViticoloFormat(rows);
    }

    const compactSataMapping = this.getCompactSataMapping(headers);
    if (compactSataMapping) {
      console.log('FieldCsvAgent: Detected compact SATA format, using deterministic parser');
      const diagnostics = createDiagnostics(rows.length, 'SATA_COMPACT');
      const parsedRows = this.extractRowsWithMapping(rows, compactSataMapping);
      const aggregatedFields = this.aggregateByParticella(parsedRows, compactSataMapping);
      const fields = this.convertToOutputFormat(aggregatedFields, compactSataMapping);
      diagnostics.extractedRows = fields.length;
      const skippedCount = rows.length - parsedRows.length;
      if (skippedCount > 0) {
        diagnostics.skippedRows.push({
          reason: 'Foglio o Particella mancante',
          count: skippedCount,
        });
      }
      return { fields, diagnostics };
    }

    // Step 2: Get column mapping from LLM (only headers + first 10 sample rows)
    const rawMapping = await this.getColumnMapping(headers, rows.slice(0, 10));
    const mapping = this.adjustAreaUnitBySample(rows, rawMapping);

    // Step 2.5: Validate LLM column mapping against actual headers
    const { columns: validatedColumns, warnings: mappingWarnings } = validateColumnMapping(
      mapping.columns,
      headers,
    );
    mapping.columns = validatedColumns as typeof mapping.columns;
    if (mappingWarnings.length > 0) {
      console.warn(`FieldCsvAgent: Column mapping warnings:`, mappingWarnings);
    }
    console.log(`FieldCsvAgent: Column mapping detected`, mapping.columns);

    const diagnostics = createDiagnostics(rows.length, 'LLM_MAPPED');
    diagnostics.warnings.push(...mappingWarnings);

    // Step 3: Try deterministic parsing first
    try {
      const parsedRows = this.extractRowsWithMapping(rows, mapping);
      console.log(`FieldCsvAgent: Extracted ${parsedRows.length} valid rows`);

      // Step 4: Aggregate by particella
      const aggregatedFields = this.aggregateByParticella(parsedRows, mapping);
      console.log(`FieldCsvAgent: Aggregated to ${aggregatedFields.length} fields`);

      if (aggregatedFields.length > 0) {
        // Step 5: Convert to output format
        const fields = this.convertToOutputFormat(aggregatedFields, mapping);
        diagnostics.extractedRows = fields.length;
        const skippedCount = rows.length - parsedRows.length;
        if (skippedCount > 0) {
          diagnostics.skippedRows.push({
            reason: 'Foglio o Particella mancante',
            count: skippedCount,
          });
        }
        return { fields, diagnostics };
      }
    } catch (error) {
      console.warn(
        `FieldCsvAgent: Deterministic parsing failed: ${error instanceof Error ? error.message : String(error)}. Falling back to LLM extraction.`,
      );
      diagnostics.warnings.push(
        `Parsing deterministico fallito: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fallback: Use LLM for full extraction if deterministic parsing fails
    console.log('FieldCsvAgent: Using LLM fallback for field extraction');
    diagnostics.detectedFormat = 'LLM_FULL_EXTRACTION';
    const llmResult = await this.extractFieldsWithLLM(csvContent);
    diagnostics.extractedRows = llmResult.fields.length;
    return { ...llmResult, diagnostics };
  }
