import type { Request } from 'express';
import { BulkExtractLabelsUseCase } from '../application/use-cases/label/BulkExtractLabelsUseCase';
import { GetBdfLabelDetailUseCase } from '../application/use-cases/label/GetBdfLabelDetailUseCase';
import { isFitoLabel } from '../domain/dtos/label.dto';
import { CsvBdfLabelDatasetRepository } from '../infrastructure/repositories/CsvBdfLabelDatasetRepository';
import { PrismaLabelExtractionRepository } from '../infrastructure/repositories/PrismaLabelExtractionRepository';
import { LabelController } from '../infrastructure/http/controllers/LabelController';
import { ExtractLabelAdapter } from '../infrastructure/services/tool/extractLabel.adapter';
import { GetLabelTextProvider } from '../infrastructure/services/tool/getLabelText.provider';
import { prisma } from '../infrastructure/repositories/Prisma';

import { accuracyOutlierThreshold, CropFamilyService, LabelComparer, type LabelEvaluation, ResponseCollector } from './match-0-evaluation';

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
