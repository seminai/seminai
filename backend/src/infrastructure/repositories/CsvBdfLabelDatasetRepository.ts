import * as fs from 'fs';
import * as path from 'path';
import { Label, LabelDoseDetail } from '../../domain/dtos/label.dto';
import {
  BdfLabelDatasetDetail,
  BdfLabelDatasetPair,
  BdfLabelDatasetQuery,
  IBdfLabelDatasetRepository,
} from '../../domain/repositories/IBdfLabelDatasetRepository';

interface BdfDatasetRow {
  readonly [key: string]: string;
}

const DEFAULT_DATASET_PATH = path.resolve(
  process.cwd(),
  'dataset',
  'bdf',
  'bdf_dosi_label_partial_20251104.csv',
);

export class CsvBdfLabelDatasetRepository implements IBdfLabelDatasetRepository {
  private cache: ReadonlyArray<BdfDatasetRow> | null = null;

  constructor(private readonly datasetPath: string = DEFAULT_DATASET_PATH) {}

  async findDetailByProductAndRegistration(
    params: BdfLabelDatasetQuery,
  ): Promise<BdfLabelDatasetDetail | null> {
    const dataset = await this.loadDataset();
    const matches = dataset.filter((row) =>
      this.isSamePair(row, params.productName, params.registrationNumber),
    );
    if (matches.length === 0) {
      return null;
    }
    return this.buildDetail(matches);
  }

  async listAvailablePairs(): Promise<ReadonlyArray<BdfLabelDatasetPair>> {
    const dataset = await this.loadDataset();
    const uniqueKeys = new Map<string, BdfLabelDatasetPair>();
    dataset.forEach((row) => {
      const productName = (row.NOME_COMMERCIALE ?? '').trim();
      const registrationNumber = (row.NUM_REG ?? '').trim();
      if (productName.length === 0 || registrationNumber.length === 0) {
        return;
      }
      const key = `${productName.toLowerCase()}::${registrationNumber.toLowerCase()}`;
      if (!uniqueKeys.has(key)) {
        uniqueKeys.set(key, { productName, registrationNumber });
      }
    });
    return Array.from(uniqueKeys.values());
  }

  private async loadDataset(): Promise<ReadonlyArray<BdfDatasetRow>> {
    if (this.cache) {
      return this.cache;
    }
    const content = fs.readFileSync(this.datasetPath, { encoding: 'utf8' });
    const [rawHeader, ...dataLines] = content.split(/\r?\n/).filter((line) => line.length > 0);
    const headerLine = rawHeader.replace(/^\uFEFF/, '');
    const headers = headerLine.split(';');
    const rows: BdfDatasetRow[] = dataLines.map((line) => this.parseLine(line, headers));
    this.cache = rows;
    return rows;
  }

  private parseLine(line: string, headers: ReadonlyArray<string>): BdfDatasetRow {
    const values = line.split(';');
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      row[header] = values[i] ?? '';
    }
    return row;
  }

  private isSamePair(row: BdfDatasetRow, productName: string, registrationNumber: string): boolean {
    const datasetName = (row.NOME_COMMERCIALE ?? '').trim().toLowerCase();
    const datasetReg = (row.NUM_REG ?? '').trim().toLowerCase();
    return (
      datasetName === productName.trim().toLowerCase() &&
      datasetReg === registrationNumber.trim().toLowerCase()
    );
  }

  private buildDetail(rows: ReadonlyArray<BdfDatasetRow>): BdfLabelDatasetDetail {
    const first = rows[0];
    const productName = first.NOME_COMMERCIALE ?? '';
    const registrationNumber = first.NUM_REG ?? '';
    const diseases = rows.map((row) => this.normalizeString(row.NOME_SCI));
    const crops = rows.map((row) => this.normalizeString(row.NOME_COLTURA));
    const label: Label = {
      prodotto: this.normalizeString(first.NOME_COMMERCIALE),
      categoria: this.normalizeString(first.COD_TIPO),
      formulazione: this.normalizeString(first.FORMULAZIONE),
      principio_attivo: this.normalizeString(first.SA1),
      composizione: null,
      meccanismo_azione_frac: null,
      malattie: this.collectUnique(diseases),
      specie: [],
      colture_target: this.collectUnique(crops),
      dosaggi_dettagliati: rows.map((row) => this.mapDoseDetail(row)),
      fasce_di_rispetto_e_deriva: [],
      avvertenze: [],
      frasi_pericolo: [],
      frasi_prudenza: [],
      compatibilita: null,
      fitotossicita: null,
      note_tecniche: this.normalizeString(first.DESCRIZIONE),
      extraction_confidence: 100,
      extracted_fields: [
        'prodotto',
        'formulazione',
        'principio_attivo',
        'colture_target',
        'malattie',
        'dosaggi_dettagliati',
      ],
      errors: [],
      numero_registrazione: this.normalizeString(first.NUM_REG),
      titolare: this.normalizeString(first.TITOLARE_REGISTRAZIONE),
      stabilimento: null,
      caratteristiche: null,
    };
    return {
      id: this.buildIdentifier(productName, registrationNumber),
      productName,
      registrationNumber,
      sourceUrl: '',
      label,
      rawText: this.buildRawText(rows),
      extractionConfidence: 100,
      extractedFields: label.extracted_fields,
      errors: [],
      qualityExtraction: [],
      lastUpdate: this.parseDate(first.LastUpdate),
    };
  }

  private mapDoseDetail(row: BdfDatasetRow): LabelDoseDetail {
    return {
      coltura: this.normalizeString(row.NOME_COLTURA) ?? 'Unknown crop',
      malattia: this.normalizeString(row.NOME_SCI),
      dose_minima: this.parseNumber(row.DOSE_MIN),
      dose_massima: this.parseNumber(row.DOSE_MAX),
      dose_um: this.normalizeString(row.DECODIFICA),
      acqua_max: this.parseNumber(row.ACQUA_HA_MAX),
      acqua_max_um: this.normalizeWaterUnit(row.ACQUA_HA_MAX),
      n_max_applicazioni: this.parseNumber(row.NUM_MAX_INT),
      n_max_applicazioni_um: this.normalizeString(row.RIF_MAX_TRATT),
      intervallo_min_giorni: this.parseNumber(row.INTERV_TRATT),
      intervallo_sicurezza_giorni: this.normalizeCarenza(row.CARENZA_C),
      epoca_impiego: this.normalizeString(row.DES_STADIO_COLT),
      modalita_applicazione: this.normalizeString(row.DES_METODO_DIST),
      istruzioni: this.normalizeString(row.DESCRIZIONE),
    };
  }

  private normalizeWaterUnit(value: string | undefined): string | null {
    if (!value || value.trim().length === 0) {
      return null;
    }
    return 'l/ha';
  }

  private normalizeCarenza(value: string | undefined): number | null {
    const parsed = this.parseNumber(value);
    if (parsed === null || parsed === 999) {
      return null;
    }
    return parsed;
  }

  private buildRawText(rows: ReadonlyArray<BdfDatasetRow>): string {
    const details = rows.map((row) => {
      const crop = this.normalizeString(row.NOME_COLTURA) ?? 'Unknown crop';
      const pest = this.normalizeString(row.NOME_SCI) ?? 'Unknown target';
      const doseMin = this.parseNumber(row.DOSE_MIN);
      const doseMax = this.parseNumber(row.DOSE_MAX);
      const unit = this.normalizeString(row.DECODIFICA) ?? '';
      const doseText = this.buildDoseRange(doseMin, doseMax, unit);
      return `${crop} - ${pest}: ${doseText}`;
    });
    return details.join('\n');
  }

  private buildDoseRange(min: number | null, max: number | null, unit: string): string {
    if (min !== null && max !== null && min !== max) {
      return `${min}-${max} ${unit}`.trim();
    }
    if (max !== null) {
      return `${max} ${unit}`.trim();
    }
    if (min !== null) {
      return `${min} ${unit}`.trim();
    }
    return 'Dose non disponibile';
  }

  private parseNumber(value: string | undefined): number | null {
    if (!value) {
      return null;
    }
    const normalized = value.replace(',', '.').trim();
    if (normalized.length === 0) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private normalizeString(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === '-' || trimmed === '999') {
      return null;
    }
    return trimmed;
  }

  private collectUnique(values: ReadonlyArray<string | null>): string[] {
    const unique = new Set<string>();
    values.forEach((value) => {
      if (value) {
        unique.add(value);
      }
    });
    return Array.from(unique);
  }

  private buildIdentifier(productName: string, registrationNumber: string): string {
    const base = `${productName}-${registrationNumber}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `bdf-${base}`;
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (!match) {
      return null;
    }
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const hours = match[4] ? Number(match[4]) : 0;
    const minutes = match[5] ? Number(match[5]) : 0;
    const seconds = match[6] ? Number(match[6]) : 0;
    const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
