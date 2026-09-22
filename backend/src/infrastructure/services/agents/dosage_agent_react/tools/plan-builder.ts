/**
 * Pure builder functions that transform dosage/compliance/stock data
 * from working memory into structured TreatmentPlan components.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TreatmentPlan,
  PlanStep,
  PlanTarget,
  PlanCompliance,
  PlanStockSummary,
  ComplianceStatus,
  ViolationSeverity,
} from '../type/plan';
import type {
  DosageResultUnit,
  ComplianceViolationLike,
  StockBalanceLike,
} from './dosage-result-types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_REGEX = /^[0-9a-f]{16,}$/i;

export interface UnitDisplayInput {
  readonly id?: string;
  readonly unitId?: string;
  readonly unitProductionId?: string;
  readonly productionUnitId?: string;
  readonly name?: string | null;
  readonly productionUnitName?: string | null;
  readonly unitName?: string | null;
  readonly cropName?: string | null;
  readonly variety?: string | null;
}

function deriveTotalQuantityUnit(doseUnit: string): string {
  const normalized = doseUnit.trim();
  if (!normalized) return '';
  return normalized
    .replace(/\/\s*ha\b/i, '')
    .replace(/\bha\s*-\s*1\b/i, '')
    .trim();
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function isLikelyTechnicalId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (UUID_REGEX.test(trimmed) || LONG_HEX_REGEX.test(trimmed)) return true;
  return trimmed.length >= 12 && /^[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed);
}

function safeDisplayText(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (!text || isLikelyTechnicalId(text)) return '';
  return text;
}

function rawIdText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function getUnitId(value: UnitDisplayInput | DosageResultUnit): string {
  const candidate = value as UnitDisplayInput;
  return (
    rawIdText(candidate.id) ||
    rawIdText(candidate.unitId) ||
    rawIdText(candidate.unitProductionId) ||
    rawIdText(candidate.productionUnitId)
  );
}

function getUnitInputDisplayName(unit: UnitDisplayInput): string {
  const explicitName =
    safeDisplayText(unit.name) ||
    safeDisplayText(unit.productionUnitName) ||
    safeDisplayText(unit.unitName);
  if (explicitName) return explicitName;

  const crop = safeDisplayText(unit.cropName);
  const variety = safeDisplayText(unit.variety);
  return [crop, variety].filter(Boolean).join(' - ');
}

export function buildUnitDisplayNameMap(
  units: ReadonlyArray<UnitDisplayInput | unknown>,
): Map<string, string> {
  const displayNames = new Map<string, string>();
  for (const raw of units) {
    const unit = raw as UnitDisplayInput;
    const id = getUnitId(unit);
    const label = getUnitInputDisplayName(unit);
    if (id && label) {
      displayNames.set(id, label);
    }
  }
  return displayNames;
}

function resolveUnitDisplayName(
  unit: DosageResultUnit,
  unitDisplayNames: ReadonlyMap<string, string> | undefined,
  unitIndex: number,
): string {
  const directName = safeDisplayText(unit.productionUnitName) || safeDisplayText(unit.unitName);
  if (directName) return directName;

  const unitId = rawIdText(unit.unitProductionId) || rawIdText(unit.productionUnitId);
  const mappedName = unitId ? safeDisplayText(unitDisplayNames?.get(unitId)) : '';
  if (mappedName) return mappedName;

  return `Unità produttiva ${unitIndex + 1}`;
}

function resolveStepUnitDisplayName(step: PlanStep, rowIndex: number): string {
  const explicitName = safeDisplayText(step.treatment.productionUnitName);
  if (explicitName) return explicitName;
  return `Unità produttiva ${rowIndex + 1}`;
}

export function buildTargets(
  dosageResults: DosageResultUnit[],
  unitDisplayNames?: ReadonlyMap<string, string>,
): PlanTarget[] {
  return dosageResults.map((unit, unitIndex) => ({
    productionUnitId: unit.unitProductionId ?? unit.productionUnitId ?? '',
    productionUnitName: resolveUnitDisplayName(unit, unitDisplayNames, unitIndex),
    cropName: unit.cropName ?? '',
    areaHa: unit.areaHa ?? 0,
    region: unit.region,
  }));
}

export function buildSteps(
  dosageResults: DosageResultUnit[],
  complianceResult?: { violations: ComplianceViolationLike[] },
  unitDisplayNames?: ReadonlyMap<string, string>,
): PlanStep[] {
  const steps: PlanStep[] = [];
  let sequence = 1;

  for (let unitIndex = 0; unitIndex < dosageResults.length; unitIndex += 1) {
    const unit = dosageResults[unitIndex];
    const productionUnitName = resolveUnitDisplayName(unit, unitDisplayNames, unitIndex);

    for (const product of unit.products ?? []) {
      for (const treatment of product.trattamenti ?? []) {
        const productViolations = (complianceResult?.violations ?? []).filter(
          (v) =>
            v.productName === product.productName ||
            v.registrationNumber === product.registrationNumber,
        );
        const complianceStatus: ComplianceStatus =
          productViolations.length === 0
            ? 'conforme'
            : productViolations.some((v) => v.severity === 'ERROR')
              ? 'non_conforme'
              : 'da_verificare';

        steps.push({
          id: uuidv4(),
          sequence: sequence++,
          status: 'pending',
          treatment: {
            productionUnitId: unit.unitProductionId ?? unit.productionUnitId ?? '',
            productionUnitName,
            cropName: unit.cropName ?? '',
            areaHa: unit.areaHa ?? 0,
            productName: product.productName ?? product.name ?? '',
            productId: product.productId,
            registrationNumber: product.registrationNumber ?? product.regNumber,
            activeIngredient: product.activeIngredient ?? product.principioAttivo ?? '',
            adversity: product.adversity ?? treatment.avversita ?? '',
            dosePerHa: treatment.dose ?? treatment.dose_ha ?? 0,
            doseUnit: treatment.dosaggio_um ?? treatment.doseUnit ?? 'kg/ha',
            totalQuantity:
              treatment.quantita_totale ??
              treatment.totalQuantity ??
              (treatment.dose ?? treatment.dose_ha ?? 0) * (unit.areaHa ?? 0),
            totalQuantityUnit: deriveTotalQuantityUnit(
              treatment.dosaggio_um ?? treatment.doseUnit ?? 'kg/ha',
            ),
            applicationDate: treatment.data_distribuzione ?? treatment.date ?? '',
            applicationMode: treatment.modalita_impiego ?? treatment.mode,
            safetyInterval: product.carenza ?? product.safetyInterval,
          },
          compliance: {
            status: complianceStatus,
            violations: productViolations.map((v) => ({
              type: v.type ?? v.ruleType,
              message: v.message ?? v.description ?? '',
              severity: (v.severity ?? 'WARNING') as ViolationSeverity,
              source: v.source ?? v.disciplinareSource,
            })),
          },
        });
      }
    }
  }
  return steps;
}
export function buildCompliance(steps: PlanStep[]): PlanCompliance {
  const conformSteps = steps.filter((s) => s.compliance.status === 'conforme').length;
  const nonConformSteps = steps.filter((s) => s.compliance.status === 'non_conforme').length;
  const warnings = steps
    .flatMap((s) => s.compliance.violations)
    .filter((v) => v.severity === 'WARNING')
    .map((v) => v.message);
  const overallStatus: ComplianceStatus =
    nonConformSteps > 0 ? 'non_conforme' : warnings.length > 0 ? 'da_verificare' : 'conforme';
  return {
    overallStatus,
    totalSteps: steps.length,
    conformSteps,
    nonConformSteps,
    warnings: [...new Set(warnings)],
  };
}
export function buildStockSummary(stockBalance: StockBalanceLike | undefined): PlanStockSummary {
  if (!stockBalance) return { hasIssues: false, products: [] };
  const products = (stockBalance.products ?? stockBalance.items ?? []).map((item) => ({
    name: item.productName ?? item.name ?? '',
    required: item.totalUsed ?? item.required ?? 0,
    available: item.available ?? item.stock ?? 0,
    deficit: Math.max(
      0,
      (item.totalUsed ?? item.required ?? 0) - (item.available ?? item.stock ?? 0),
    ),
    unit: item.unit ?? item.unitOfMeasure ?? 'kg',
  }));
  return { hasIssues: products.some((p) => p.deficit > 0), products };
}
export function buildExcludedProductsSummary(
  dosageResults: DosageResultUnit[],
  unitDisplayNames?: ReadonlyMap<string, string>,
): Array<{
  productionUnit: string;
  cropName: string;
  productName: string;
  registrationNumber: string;
  reason: string;
}> {
  return dosageResults.flatMap((unit, unitIndex) =>
    (unit.excludedProducts ?? []).map((product) => ({
      productionUnit: resolveUnitDisplayName(unit, unitDisplayNames, unitIndex),
      cropName: unit.cropName ?? '',
      productName: product.productName ?? product.name ?? '',
      registrationNumber: product.registrationNumber ?? product.regNumber ?? '',
      reason: product.exclusionReason ?? product.reason ?? 'Prodotto escluso dal piano.',
    })),
  );
}
export function buildMarkdownTable(steps: PlanStep[], stockSummary: PlanStockSummary): string {
  const rows = steps.map((s, rowIndex) => {
    const icon =
      s.compliance.status === 'conforme'
        ? '✅'
        : s.compliance.status === 'non_conforme'
          ? '❌'
          : '⚠️';
    const totalUnit =
      s.treatment.totalQuantityUnit || deriveTotalQuantityUnit(s.treatment.doseUnit);
    const sources = s.evidence?.sources.map((source) => source.label).join('; ') || '-';
    return [
      formatCell(s.sequence),
      formatCell(resolveStepUnitDisplayName(s, rowIndex)),
      formatCell(s.treatment.cropName),
      formatCell(s.treatment.applicationDate),
      formatCell(s.treatment.productName),
      formatCell(s.treatment.registrationNumber),
      formatCell(s.treatment.activeIngredient),
      formatCell(s.treatment.adversity),
      formatCell(`${s.treatment.dosePerHa} ${s.treatment.doseUnit}`),
      formatCell(s.evidence?.label.doseRange),
      formatCell(s.evidence?.disciplinare.doseLimit),
      formatCell(s.evidence?.derogations.notes.join('; ')),
      formatCell(`${Number(s.treatment.totalQuantity.toFixed(3))} ${totalUnit}`),
      formatCell(`${icon} ${s.compliance.status.toUpperCase()}`),
      formatCell(sources),
    ].join(' | ');
  });
  const stockWarnings = stockSummary.hasIssues
    ? `\n⚠️ PROBLEMI STOCK:\n${stockSummary.products
        .filter((p) => p.deficit > 0)
        .map(
          (p) =>
            `- ${p.name}: necessari ${p.required} ${p.unit}, disponibili ${p.available} (deficit: ${p.deficit})`,
        )
        .join('\n')}`
    : '';
  return `| # | Unità | Coltura | Data | Prodotto | Reg. | P.A. | Avversità | Dose/ha | Limite etichetta | Limite disciplinare | Bollettini/deroghe | Quantità totale | Verdetto | Fonti |\n|---|-------|---------|------|----------|------|------|-----------|---------|----------------|---------------------|--------------------|-----------------|----------|-------|\n| ${rows.join(' |\n| ')} |${stockWarnings}`;
}
export type { TreatmentPlan };
