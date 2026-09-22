import fs from 'fs';
import path from 'path';
import { buildMatch1Report, type GroundTruthUnitItem } from './match_1';
import { buildMatch2Report, printMatch2Report } from './match_2';
import { flowMatchCropTreatment } from '../infrastructure/services/agents/dosage_agent/flowMatchCropTreatment';
import { normalizedUnits } from '../infrastructure/utils/normalizeCrop';
import type { InputDosageAgent } from '../infrastructure/services/agents/dosage_agent';
import {
  getCompanyGroundTruthByYear,
  getCompanyInputGroundTruthByYear,
  getCompanyUnitTreatmentsWithDatesByYear,
} from '../infrastructure/services/treatmet_extraction_dataset/get_year_crop_field';
import {
  flowMatchProductionUnitTreatmentDosageV2,
  calculateStockBalance,
} from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { printStockBalanceReport } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from '../infrastructure/services/agents/dosage_agent/historyCollector';

function mapToGroundTruthUnitItems(
  data: ReadonlyArray<{
    readonly idApp?: string;
    readonly name: string;
    readonly coltura: string;
    readonly varieta: string;
    readonly products: ReadonlyArray<{
      readonly name: string;
      readonly regNumber: string;
      readonly quantity: string;
      readonly unit: string;
    }>;
  }>,
): ReadonlyArray<GroundTruthUnitItem> {
  return data.map((unit) => ({
    unitProductionId: unit.idApp ?? unit.name,
    cropName: unit.coltura,
    variety: unit.varieta,
    products: unit.products.map((p) => ({
      name: p.name,
      regNumber: p.regNumber,
      quantity: p.quantity,
      unit: p.unit,
    })),
  }));
}

export async function runMatch1Only(
  company: string,
  opts: { year: number; csvPath?: string; ftsCsvPath?: string; ftsJsonPath?: string } = {
    year: 2025,
  },
): Promise<string> {
  const start = Date.now();
  const year = opts.year;
  console.log(`[MATCH-1] Starting test for company: ${company}, year: ${year}`);
  const gtRaw = await getCompanyGroundTruthByYear(
    year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );
  const gt = mapToGroundTruthUnitItems(gtRaw);
  console.log(`[MATCH-1] Ground truth loaded: ${gt.length} production units`);
  const input = await getCompanyInputGroundTruthByYear(
    year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );
  console.log(
    `[MATCH-1] Input loaded: ${input.products.length} products, ${input.productionUnits.length} units`,
  );
  const agentInput = buildAgentInputFromCompanyInput(input);
  const matchStart = Date.now();
  const historyManager = new JobHistoryManager();
  const matchedOnly = await flowMatchCropTreatment(agentInput, historyManager);
  const matchDurationMs = Date.now() - matchStart;
  const report = buildMatch1Report({ company, year, groundTruth: gt, matched: matchedOnly });
  console.log(
    `[MATCH-1] ✅ Accuracy: ${(report.accuracy * 100).toFixed(1)}% (${report.matched}/${report.totalGroundTruthProducts})`,
  );
  console.log(`[MATCH-1] ❌ Outliers: ${report.outliers.length}`);
  if (report.outliers.length > 0) {
    console.log('\n[MATCH-1] Outliers details:');
    for (const outlier of report.outliers) {
      console.log(
        `  - ${outlier.product} | Expected in: ${outlier.espectedIn} | Assigned to: ${outlier.assignedErrorAt || 'NOT MATCHED'}`,
      );
    }
  }
  const filePath = writeReportFile(report, company, 'match-1');
  const totalDurationMs = Date.now() - start;
  console.log(
    `[MATCH-1] Duration: match=${(matchDurationMs / 1000).toFixed(2)}s, total=${(totalDurationMs / 1000).toFixed(2)}s`,
  );
  console.log(`[MATCH-1] Report saved to: ${filePath}`);
  return filePath;
}

export async function runGroundTest(
  company: string,
  opts: { year: number; csvPath?: string; ftsCsvPath?: string; ftsJsonPath?: string } = {
    year: 2025,
  },
): Promise<string> {
  const globalStart = Date.now();
  const year = opts.year;
  const gtRaw = await getCompanyGroundTruthByYear(
    year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );
  const gt = mapToGroundTruthUnitItems(gtRaw);
  const input = await getCompanyInputGroundTruthByYear(
    year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );

  const agentInput = buildAgentInputFromCompanyInput(input);
  const historyManager = new JobHistoryManager();
  const match1Start = Date.now();
  const matchedOnly = await flowMatchCropTreatment(agentInput, historyManager);
  const match1DurationMs = Date.now() - match1Start;
  const report = buildMatch1Report({ company, year, groundTruth: gt, matched: matchedOnly });
  // eslint-disable-next-line no-console
  console.log(
    `[GROUND] Accuracy ${(report.accuracy * 100).toFixed(1)}% (${report.matched}/${report.totalGroundTruthProducts}), outliers: ${report.outliers.length}`,
  );
  const filePath1 = writeReportFile(report, company);

  // MATCH 2: dosage & timing alignment vs dataset per unit treatments
  const match2Start = Date.now();
  // flowMatchProductionUnitTreatmentDosageV2 usa il nuovo approccio con treatmentDatePlanner + ottimizzazione lineare
  const llmDosage = await flowMatchProductionUnitTreatmentDosageV2(
    matchedOnly,
    undefined,
    historyManager,
    true, // outStockLimiter: scala le dosi per rispettare lo stock disponibile
    undefined,
  );
  const stockBalance = calculateStockBalance(llmDosage);
  console.log('\n📊 BILANCIO GIACENZE:');
  printStockBalanceReport(stockBalance);
  const datasetPerUnit = await getCompanyUnitTreatmentsWithDatesByYear(
    year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );
  const report2 = buildMatch2Report({ company, year, llm: llmDosage, dataset: datasetPerUnit });
  const match2DurationMs = Date.now() - match2Start;
  // eslint-disable-next-line no-console
  console.log(
    `[GROUND-2] Units ${report2.units.length}. Match rate: ${(report2.overallMatchRate * 100).toFixed(1)}% (${report2.totalMatchedTreatments}/${report2.totalGroundTruthTreatments})`,
  );
  printMatch2Report(report2);
  const filePath2 = writeReportFile(report2, company, 'match-2');
  const totalDurationMs = Date.now() - globalStart;
  // eslint-disable-next-line no-console
  console.log(
    `[GROUND] V2: treatmentDatePlanner + optimizeLinearFunc | durate -> match1: ${(match1DurationMs / 60000).toFixed(2)} min, match2: ${(
      match2DurationMs / 60000
    ).toFixed(2)} min, totale: ${(totalDurationMs / 60000).toFixed(2)} min`,
  );
  return filePath2 || filePath1;
}

function buildAgentInputFromCompanyInput(input: {
  readonly products: ReadonlyArray<{
    name: string;
    regNumber: string;
    quantity?: string | number;
    unit?: string;
  }>;
  readonly productionUnits: ReadonlyArray<{
    idApp?: string;
    name: string;
    coltura: string;
    varieta: string;
    superficie?: string | number;
  }>;
}): InputDosageAgent {
  const products = input.products.map((p) => {
    const quantity =
      typeof p.quantity === 'number'
        ? p.quantity
        : typeof p.quantity === 'string' && p.quantity.trim()
          ? parseFloat(p.quantity.replace(/,/g, '.'))
          : 0;
    return {
      productName: p.name,
      registrationNumber: p.regNumber,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      quantityUnitOfMeasure: p.unit || 'N/A',
    };
  });
  const unitOfProduction = normalizedUnits({
    unitOfProduction: input.productionUnits.map((u) => ({
      id: u.idApp ?? u.name,
      cropName: u.coltura,
      variety: u.varieta,
      superficie: u.superficie,
    })),
  });
  return { products, unitOfProduction } as InputDosageAgent;
}

function writeReportFile(
  report: unknown,
  company: string,
  sub: 'match-1' | 'match-2' = 'match-1',
): string {
  const outDir = path.resolve(process.cwd(), 'extraction', sub);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${company.replace(/\s+/g, '-')}.json`;
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: 'utf-8' });
  return filePath;
}
