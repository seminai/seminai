import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Label } from '../domain/dtos/label.dto';

const cropFamiliesPath: string = path.resolve(
  process.cwd(),
  'dataset',
  'crop_family',
  'crop-families.csv',
);
export const accuracyOutlierThreshold = 0.8;

export interface ControllerResult<T> {
  readonly status: string;
  readonly data: T;
}

export interface EvaluationMetric {
  readonly name: string;
  readonly value: number;
  readonly notes: ReadonlyArray<string>;
}

export interface LabelEvaluation {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly accuracy: number;
  readonly metrics: ReadonlyArray<EvaluationMetric>;
  readonly status: 'evaluated' | 'missing';
  readonly error?: string;
}

export interface CropFamiliesDictionary {
  readonly categoryToSpecies: Map<string, Set<string>>;
  readonly speciesToCategories: Map<string, Set<string>>;
}

export class ResponseCollector {
  private payload: unknown = null;
  getResponse<T>(): ControllerResult<T> {
    return this.payload as ControllerResult<T>;
  }
  createExpressResponse(): Response {
    const response: Partial<Response> = {
      json: (body: unknown) => {
        this.payload = body;
        return response as Response;
      },
    };
    return response as Response;
  }
}

export class CropFamilyService {
  constructor(private readonly dictionary: CropFamiliesDictionary) {}
  static loadDictionary(): CropFamilyService {
    const content: string = fs.readFileSync(cropFamiliesPath, { encoding: 'utf8' });
    const lines: string[] = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const categoryToSpecies: Map<string, Set<string>> = new Map();
    const speciesToCategories: Map<string, Set<string>> = new Map();
    for (let i = 1; i < lines.length; i += 1) {
      const values: string[] = CropFamilyService.splitCsvLine(lines[i]);
      if (values.length < 2) {
        continue;
      }
      const category: string = CropFamilyService.normalize(values[0]);
      const species: string = CropFamilyService.normalize(values[1]);
      if (!category || !species) {
        continue;
      }
      if (!categoryToSpecies.has(category)) {
        categoryToSpecies.set(category, new Set());
      }
      categoryToSpecies.get(category)?.add(species);
      if (!speciesToCategories.has(species)) {
        speciesToCategories.set(species, new Set());
      }
      speciesToCategories.get(species)?.add(category);
    }
    return new CropFamilyService({ categoryToSpecies, speciesToCategories });
  }
  static splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    result.push(current.trim());
    return result.map((value) => value.replace(/^"|"$/g, ''));
  }
  static normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[^\p{ASCII}]/gu, '')
      .trim()
      .toLowerCase();
  }
  isCropCovered(bdfCrop: string, extractedCrop: string): boolean {
    const normalizedBdf: string = CropFamilyService.normalize(bdfCrop);
    const normalizedExtracted: string = CropFamilyService.normalize(extractedCrop);
    if (normalizedBdf === normalizedExtracted) {
      return true;
    }
    const speciesCategories = this.dictionary.speciesToCategories.get(normalizedBdf);
    if (speciesCategories && speciesCategories.has(normalizedExtracted)) {
      return true;
    }
    const categorySpecies = this.dictionary.categoryToSpecies.get(normalizedExtracted);
    if (categorySpecies && categorySpecies.has(normalizedBdf)) {
      return true;
    }
    return false;
  }
}

export class LabelComparer {
  constructor(private readonly cropService: CropFamilyService) {}
  compare(bdf: Label, extracted: Label): LabelEvaluation {
    const metrics: EvaluationMetric[] = [];
    metrics.push(this.compareScalar('productName', bdf.prodotto, extracted.prodotto));
    metrics.push(
      this.compareScalar(
        'registrationNumber',
        bdf.numero_registrazione ?? null,
        extracted.numero_registrazione ?? null,
      ),
    );
    metrics.push(
      this.compareScalar('formulazione', bdf.formulazione ?? null, extracted.formulazione ?? null),
    );
    metrics.push(
      this.compareScalar('principio_attivo', bdf.principio_attivo, extracted.principio_attivo),
    );
    metrics.push(
      this.compareStringList('colture_target', bdf.colture_target, extracted.colture_target),
    );
    metrics.push(this.compareStringList('malattie', bdf.malattie, extracted.malattie));
    const accuracy: number =
      metrics.reduce((acc, metric) => acc + metric.value, 0) / metrics.length;
    return {
      productName: extracted.prodotto ?? 'unknown',
      registrationNumber: extracted.numero_registrazione ?? 'unknown',
      accuracy,
      metrics,
      status: 'evaluated',
    };
  }
  private compareScalar(
    name: string,
    expected: string | null,
    actual: string | null,
  ): EvaluationMetric {
    const normalizedExpected: string = expected ? CropFamilyService.normalize(expected) : '';
    const normalizedActual: string = actual ? CropFamilyService.normalize(actual) : '';
    const value: number =
      normalizedExpected.length === 0 ? 1 : normalizedExpected === normalizedActual ? 1 : 0;
    return { name, value, notes: [] };
  }
  private compareStringList(
    name: string,
    expectedList: ReadonlyArray<string>,
    actualList: ReadonlyArray<string>,
  ): EvaluationMetric {
    if (expectedList.length === 0) {
      return { name, value: 1, notes: [] };
    }
    const expectedNormalized: string[] = expectedList
      .map((item) => CropFamilyService.normalize(item))
      .filter((item) => item.length > 0);
    const actualNormalized: string[] = actualList
      .map((item) => CropFamilyService.normalize(item))
      .filter((item) => item.length > 0);
    if (actualNormalized.length === 0) {
      return { name, value: 0, notes: [`Missing values for ${name}`] };
    }
    let matched = 0;
    const notes: string[] = [];
    expectedNormalized.forEach((expectedItem) => {
      const found = actualNormalized.some((actualItem) =>
        this.cropService.isCropCovered(expectedItem, actualItem),
      );
      if (found) {
        matched += 1;
      } else {
        notes.push(`Missing expected value ${expectedItem}`);
      }
    });
    const value: number = matched / expectedNormalized.length;
    return { name, value, notes };
  }
}
