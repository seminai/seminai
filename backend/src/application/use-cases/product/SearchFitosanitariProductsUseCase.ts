import fs from 'fs';
import path from 'path';

interface FitosanitariRecord {
  readonly num_registrazione: string;
  readonly denominazione_prodotto: string;
  readonly sostanze_attive?: string;
  readonly stato_amministrativo?: string;
}

export interface SearchFitosanitariProductsInput {
  readonly q?: string;
  readonly name?: string;
  readonly registrationNumber?: string;
  readonly activeIngredient?: string;
  readonly limit?: number;
}

export interface FitosanitariProductSearchResult {
  readonly name: string;
  readonly registrationNumber: string;
  readonly activeIngredient: string | null;
  readonly administrativeStatus: string | null;
}

export interface SearchFitosanitariProductsOutput {
  readonly products: readonly FitosanitariProductSearchResult[];
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Searches the local Ministry phytosanitary product dataset.
 */
export class SearchFitosanitariProductsUseCase {
  private records: readonly FitosanitariRecord[] | null = null;

  execute(input: SearchFitosanitariProductsInput): SearchFitosanitariProductsOutput {
    const filters = this.buildFilters(input);
    const limit = this.normalizeLimit(input.limit);
    const products = this.loadRecords()
      .filter((record) => this.matchesFilters(record, filters))
      .slice(0, limit)
      .map((record) => ({
        name: record.denominazione_prodotto,
        registrationNumber: record.num_registrazione,
        activeIngredient: this.toNullableText(record.sostanze_attive),
        administrativeStatus: this.toNullableText(record.stato_amministrativo),
      }));
    return { products };
  }

  private loadRecords(): readonly FitosanitariRecord[] {
    if (this.records) return this.records;
    const datasetPath = path.resolve(process.cwd(), 'dataset', 'fitosanitari', 'fts_06062025.json');
    const fileContent = fs.readFileSync(datasetPath, 'utf-8');
    this.records = JSON.parse(fileContent) as readonly FitosanitariRecord[];
    return this.records;
  }

  private buildFilters(input: SearchFitosanitariProductsInput): SearchFitosanitariProductsInput {
    return {
      q: this.normalize(input.q),
      name: this.normalize(input.name),
      registrationNumber: this.normalizeRegistration(input.registrationNumber),
      activeIngredient: this.normalize(input.activeIngredient),
    };
  }

  private matchesFilters(
    record: FitosanitariRecord,
    filters: SearchFitosanitariProductsInput,
  ): boolean {
    const name = this.normalize(record.denominazione_prodotto);
    const rawRegistrationNumber = this.normalize(record.num_registrazione);
    const registrationNumber = this.normalizeRegistration(record.num_registrazione);
    const activeIngredient = this.normalize(record.sostanze_attive);
    const searchText = [name, rawRegistrationNumber, registrationNumber, activeIngredient].join(
      ' ',
    );
    if (filters.q && !searchText.includes(filters.q)) return false;
    if (filters.name && !name.includes(filters.name)) return false;
    if (filters.registrationNumber && !registrationNumber.includes(filters.registrationNumber)) {
      return false;
    }
    if (filters.activeIngredient && !activeIngredient.includes(filters.activeIngredient)) {
      return false;
    }
    return true;
  }

  private normalizeLimit(value?: number): number {
    if (!value || Number.isNaN(value)) return DEFAULT_LIMIT;
    return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
  }

  private normalize(value?: string): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private normalizeRegistration(value?: string): string {
    return this.normalize(value).replace(/^0+/, '');
  }

  private toNullableText(value?: string): string | null {
    const text = String(value ?? '').trim();
    return text && text !== '-' ? text : null;
  }
}
