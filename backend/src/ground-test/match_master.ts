import fs from 'fs';
import path from 'path';
import {
  getCompanyInputGroundTruthByYear,
  getCompanyUnitTreatmentsWithDatesByYear,
} from '../infrastructure/services/treatmet_extraction_dataset/get_year_crop_field';
import { runFlows, InputDosageAgent } from '../infrastructure/services/agents/dosage_agent';
import { normalizedUnits } from '../infrastructure/utils/normalizeCrop';
import { evaluateCompliance } from './evaluators/complianceEvaluator';
import { evaluatePlausibility } from './evaluators/plausibilityEvaluator';
import { evaluateLabelDosage, printLabelDosageReport } from './evaluators/labelDosageEvaluator';
import { generateDualScoreReport, printDualScoreReport } from './reporters/dualScoreReporter';
import type { ValidationResult, TreatmentComparisonInput } from './evaluators/types';
import { Label, isFitoLabel } from '../domain/dtos/label.dto';

function normalizeRegNumber(value: string): string {
  const trimmed = String(value || '').trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, '');
  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : '0';
}

type GroundTruthInput = Awaited<ReturnType<typeof getCompanyInputGroundTruthByYear>>;

function mapToAgentInput(input: GroundTruthInput): InputDosageAgent {
  return {
    products: input.products.map((p) => ({
      productName: p.name,
      registrationNumber: p.regNumber,
      quantity: parseFloat(String(p.quantity || '0').replace(',', '.')),
      quantityUnitOfMeasure: p.unit || 'N/A',
    })),
    unitOfProduction: normalizedUnits({
      unitOfProduction: input.productionUnits.map((u) => ({
        id: u.idApp ?? u.name,
        cropName: u.coltura,
        variety: u.varieta,
        superficie: u.superficie,
      })),
    }),
    outStockLimiter: true,
  };
}

export async function runDualScoreTest(
  company: string,
  opts: { year: number; csvPath?: string; ftsCsvPath?: string; ftsJsonPath?: string } = {
    year: 2025,
  },
) {
  console.log(`\n🚀 AVVIO DUAL SCORE TEST per ${company} (${opts.year})`);

  // 1. Carica Dati Input (Magazzino + Campi)
  const inputRaw = await getCompanyInputGroundTruthByYear(
    opts.year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );
  const agentInput = mapToAgentInput(inputRaw);

  // 2. Esegui il Flusso Completo (runFlows include V2: treatmentDatePlanner + optimizeLinearFunc + Disciplinari)
  console.log(`[TEST] Esecuzione agent runFlows (V2)...`);
  const start = Date.now();
  const { outcomeWithDosage, stockBalance } = await runFlows(agentInput, { persist: false });
  const durationSec = (Date.now() - start) / 1000;
  console.log(`[TEST] Agent completato in ${durationSec.toFixed(2)}s`);
  console.log(
    `[TEST] Stock: ${stockBalance.productsWithinLimit}/${stockBalance.totalProducts} prodotti entro limiti, ${stockBalance.productsOverused} in sforamento`,
  );

  // 3. Carica Ground Truth (Trattamenti Reali per confronto)
  const datasetPerUnit = await getCompanyUnitTreatmentsWithDatesByYear(
    opts.year,
    company,
    opts.csvPath,
    opts.ftsCsvPath,
    opts.ftsJsonPath,
  );

  // 4. Valutazione
  const validationResults: ValidationResult[] = [];
  const labelDosageResults: Array<{
    unitId: string;
    productName: string;
    result: ReturnType<typeof evaluateLabelDosage>;
  }> = [];

  for (const aiUnit of outcomeWithDosage) {
    const gtUnit = datasetPerUnit.find((u) => u.unitProductionId === aiUnit.unitProductionId);

    for (const aiProduct of aiUnit.products || []) {
      const productIdentity = aiProduct as { readonly regNumber?: string; readonly name?: string };
      const regNumber = productIdentity.regNumber || '';
      const productName = productIdentity.name || '';
      const normalizedReg = normalizeRegNumber(regNumber);

      // Estrai l'etichetta dal prodotto
      const rawLabel = (aiProduct as { label?: unknown }).label;
      const label: Label | undefined = rawLabel && isFitoLabel(rawLabel) ? rawLabel : undefined;

      // Trova corrispondente GT
      const gtProductTreatments = gtUnit
        ? gtUnit.products.filter((p) => normalizeRegNumber(p.regNumber) === normalizedReg)
        : [];

      // Preparazione input Plausibility
      const aiTreatments: TreatmentComparisonInput['ai'][] = (aiProduct.trattamenti || []).map(
        (t) => ({
          date: t.data_distribuzione || undefined,
          dose: t.dose,
          unit: t.dosaggio_um,
          phenology: t.epoca_impiego,
        }),
      );

      const gtTreatments: TreatmentComparisonInput['gt'][] = gtProductTreatments.map((t) => ({
        date: t.data_distribuzione ? new Date(t.data_distribuzione) : undefined,
        dose: t.dosaggio,
        unit: t.dosaggio_um,
      }));

      // Evaluate Plausibility
      const plausibility = evaluatePlausibility(aiTreatments, gtTreatments);

      // Evaluate Compliance
      // Nota: runFlows -> flowMatchDosageDisciplinari scrive le violazioni in 'note'
      const complianceInput = {
        productName,
        treatments: (aiProduct.trattamenti || []).map((t) => ({
          dose: t.dose,
          note: t.note,
          numApplications: aiProduct.trattamenti?.length,
        })),
      };
      const compliance = evaluateCompliance(complianceInput);

      // Evaluate Label Dosage Compliance (dose nel range etichetta)
      const labelDosageResult = evaluateLabelDosage({
        productName,
        regNumber,
        cropName: aiUnit.cropName || '',
        label,
        treatments: (aiProduct.trattamenti || []).map((t) => ({
          dose: t.dose,
          dosaggio_um: t.dosaggio_um,
          data_distribuzione: t.data_distribuzione,
          epoca_impiego: t.epoca_impiego,
        })),
      });

      labelDosageResults.push({
        unitId: aiUnit.unitProductionId,
        productName,
        result: labelDosageResult,
      });

      validationResults.push({
        unitId: aiUnit.unitProductionId,
        productName,
        regNumber,
        compliance,
        plausibility,
        labelDosage: {
          isCompliant: labelDosageResult.isCompliant,
          score: labelDosageResult.score,
          treatmentsInRange: labelDosageResult.details.treatmentsInRange,
          totalTreatments: labelDosageResult.details.totalTreatments,
          doseRange: labelDosageResult.details.doseRange,
          violations: labelDosageResult.violations.map((v) => v.message),
        },
      });
    }
  }

  // Print Label Dosage Report
  printLabelDosageReport(labelDosageResults);

  // 5. Reporting
  const report = generateDualScoreReport(validationResults);
  printDualScoreReport(report);

  // Calcola metriche Label Dosage aggregate
  const labelDosageWithData = labelDosageResults.filter(
    (r) => r.result.details.labelFound && r.result.details.dosageDetailFound,
  );
  const labelDosageCompliant = labelDosageWithData.filter((r) => r.result.isCompliant).length;
  const labelDosageAvgScore =
    labelDosageWithData.length > 0
      ? labelDosageWithData.reduce((sum, r) => sum + r.result.score, 0) / labelDosageWithData.length
      : 0;

  // Aggiungi metriche stock e label dosage al report
  const fullReport = {
    ...report,
    stockMetrics: {
      totalProducts: stockBalance.totalProducts,
      productsWithinLimit: stockBalance.productsWithinLimit,
      productsOverused: stockBalance.productsOverused,
      overusedProducts: stockBalance.products
        .filter((p) => p.isOverused)
        .map((p) => ({
          name: p.productName,
          regNumber: p.regNumber,
          available: p.quantityAvailable,
          used: p.totalUsed,
          shortage: p.totalUsed - p.quantityAvailable,
        })),
    },
    labelDosageMetrics: {
      totalEvaluated: labelDosageWithData.length,
      compliant: labelDosageCompliant,
      complianceRate:
        labelDosageWithData.length > 0
          ? (labelDosageCompliant / labelDosageWithData.length) * 100
          : 0,
      averageScore: labelDosageAvgScore,
      violations: labelDosageResults
        .filter((r) => r.result.violations.length > 0)
        .map((r) => ({
          unitId: r.unitId,
          productName: r.productName,
          violations: r.result.violations.map((v) => v.message),
        })),
    },
    executionTimeSeconds: durationSec,
  };

  // Salva report JSON
  const outDir = path.resolve(process.cwd(), 'extraction', 'dual-score');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${company.replace(/\s+/g, '-')}.json`;
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(fullReport, null, 2));

  console.log(`[TEST] Report salvato in: extraction/dual-score/${filename}`);
}
