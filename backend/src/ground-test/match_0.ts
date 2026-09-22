import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { BulkExtractLabelsUseCase } from '../application/use-cases/label/BulkExtractLabelsUseCase';
import { GetBdfLabelDetailUseCase } from '../application/use-cases/label/GetBdfLabelDetailUseCase';
import { Label, isFitoLabel } from '../domain/dtos/label.dto';
import { CsvBdfLabelDatasetRepository } from '../infrastructure/repositories/CsvBdfLabelDatasetRepository';
import { PrismaLabelExtractionRepository } from '../infrastructure/repositories/PrismaLabelExtractionRepository';
import { LabelController } from '../infrastructure/http/controllers/LabelController';
import { ExtractLabelAdapter } from '../infrastructure/services/tool/extractLabel.adapter';
import { GetLabelTextProvider } from '../infrastructure/services/tool/getLabelText.provider';
import { prisma } from '../infrastructure/repositories/Prisma';

const cropFamiliesPath: string = path.resolve(
  process.cwd(),
  'dataset',
  'crop_family',
  'crop-families.csv',
);
const accuracyOutlierThreshold: number = 0.8;

interface ControllerResult<T> {
  readonly status: string;
  readonly data: T;
}

interface EvaluationMetric {
  readonly name: string;
  readonly value: number;
  readonly notes: ReadonlyArray<string>;
}

interface LabelEvaluation {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly accuracy: number;
  readonly metrics: ReadonlyArray<EvaluationMetric>;
  readonly status: 'evaluated' | 'missing';
  readonly error?: string;
}

interface CropFamiliesDictionary {
  readonly categoryToSpecies: Map<string, Set<string>>;
  readonly speciesToCategories: Map<string, Set<string>>;
}

class ResponseCollector {
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

class CropFamilyService {
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

class LabelComparer {
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

class EvaluationRunner {
  private readonly controller: LabelController;
  private readonly cropService: CropFamilyService;
  private readonly repository: PrismaLabelExtractionRepository;
  private readonly bulkUseCase: BulkExtractLabelsUseCase;
  private readonly bdfDetailUseCase: GetBdfLabelDetailUseCase;
  private readonly comparer: LabelComparer;
  constructor() {
    this.controller = new LabelController();
    this.cropService = CropFamilyService.loadDictionary();
    this.repository = new PrismaLabelExtractionRepository(prisma);
    this.bulkUseCase = new BulkExtractLabelsUseCase(
      this.repository,
      new GetLabelTextProvider(),
      new ExtractLabelAdapter(),
    );
    this.bdfDetailUseCase = new GetBdfLabelDetailUseCase(new CsvBdfLabelDatasetRepository());
    this.comparer = new LabelComparer(this.cropService);
  }
  async run(): Promise<void> {
    const pairs = await this.fetchBdfPairs();
    const limitedPairs = this.limitPairs(pairs);
    await this.ensureExtractions(limitedPairs);
    const evaluations: LabelEvaluation[] = await this.evaluateLabels(limitedPairs);
    this.printReport(evaluations);
  }
  private async fetchBdfPairs(): Promise<
    ReadonlyArray<{ productName: string; registrationNumber: string }>
  > {
    const collector = new ResponseCollector();
    const response = collector.createExpressResponse();
    await this.controller.listBdfLabelPairs({} as Request, response);
    const payload =
      collector.getResponse<ReadonlyArray<{ productName: string; registrationNumber: string }>>();
    return payload.data;
  }
  private limitPairs(
    pairs: ReadonlyArray<{ productName: string; registrationNumber: string }>,
  ): ReadonlyArray<{ productName: string; registrationNumber: string }> {
    const limitEnv = process.env.BDF_EVAL_LIMIT;
    const limit = limitEnv ? Math.max(1, Number(limitEnv)) : 20;
    return pairs.slice(0, limit);
  }
  private async ensureExtractions(
    pairs: ReadonlyArray<{ productName: string; registrationNumber: string }>,
  ): Promise<void> {
    if (pairs.length === 0) {
      return;
    }
    const items = pairs.map((pair) => ({
      name: pair.productName,
      regNumber: pair.registrationNumber,
    }));
    const result = await this.bulkUseCase.execute({ items, concurrency: 5 });
    const failures = result.results.filter((item) => item.status === 'failed');
    if (failures.length > 0) {
      console.warn(
        'Extraction failures',
        failures.map((item) => ({
          name: item.name,
          regNumber: item.regNumber,
          error: item.error ?? 'unknown',
        })),
      );
    }
  }
  private async evaluateLabels(
    pairs: ReadonlyArray<{ productName: string; registrationNumber: string }>,
  ): Promise<LabelEvaluation[]> {
    const evaluations: LabelEvaluation[] = [];
    for (const pair of pairs) {
      const record = await this.repository.findByProductAndRegistration({
        productName: pair.productName,
        registrationNumber: pair.registrationNumber,
      });
      if (!record || !isFitoLabel(record.label)) {
        evaluations.push({
          productName: pair.productName,
          registrationNumber: pair.registrationNumber,
          accuracy: 0,
          metrics: [],
          status: 'missing',
          error: 'Extraction not available',
        });
        continue;
      }
      const bdfDetail = await this.bdfDetailUseCase.execute({
        productName: pair.productName,
        registrationNumber: pair.registrationNumber,
      });
      if (!bdfDetail) {
        evaluations.push({
          productName: pair.productName,
          registrationNumber: pair.registrationNumber,
          accuracy: 0,
          metrics: [],
          status: 'missing',
          error: 'BDF detail unavailable',
        });
        continue;
      }
      const evaluation = this.comparer.compare(bdfDetail.label, record.label);
      evaluations.push({
        productName: pair.productName,
        registrationNumber: pair.registrationNumber,
        accuracy: evaluation.accuracy,
        metrics: evaluation.metrics,
        status: 'evaluated',
      });
    }
    return evaluations;
  }
  private printReport(evaluations: ReadonlyArray<LabelEvaluation>): void {
    const overview = evaluations.map((evaluation) => ({
      productName: evaluation.productName,
      registrationNumber: evaluation.registrationNumber,
      accuracy: evaluation.accuracy.toFixed(2),
      status: evaluation.status,
      error: evaluation.error ?? '',
    }));
    console.table(overview);
    evaluations.forEach((evaluation) => {
      if (evaluation.metrics.length === 0) {
        return;
      }
      console.log(`Dettaglio ${evaluation.productName} (${evaluation.registrationNumber})`);
      evaluation.metrics.forEach((metric) => {
        console.log(`  ${metric.name}: ${(metric.value * 100).toFixed(2)}%`);
        if (metric.notes.length > 0) {
          console.log(`    Note: ${metric.notes.join('; ')}`);
        }
      });
    });
    const evaluated = evaluations.filter((evaluation) => evaluation.status === 'evaluated');
    if (evaluated.length > 0) {
      const totalAccuracy =
        evaluated.reduce((acc, evaluation) => acc + evaluation.accuracy, 0) / evaluated.length;
      console.log(`Overall accuracy: ${(totalAccuracy * 100).toFixed(2)}%`);
    }
    const outliers = evaluations.filter(
      (evaluation) =>
        evaluation.status === 'evaluated' && evaluation.accuracy < accuracyOutlierThreshold,
    );
    if (outliers.length > 0) {
      console.warn(
        'Outliers',
        outliers.map((evaluation) => ({
          productName: evaluation.productName,
          registrationNumber: evaluation.registrationNumber,
          accuracy: evaluation.accuracy.toFixed(2),
        })),
      );
    }
  }
}

void new EvaluationRunner().run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
