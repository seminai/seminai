/**
 * SA Group Limits Checker for Conformity Agent
 *
 * Validates the maximum number of treatments per active substance (SA) group
 * using the company's assigned disciplinari rules via RAG.
 *
 * Receives pre-extracted disciplinare info from rulesComplianceChecker to avoid
 * duplicate RAG queries.
 */

import { normalizeActiveIngredient, buildProductKey } from '../dosage_agent/productAccessors';
import { Label } from '../../../../domain/dtos/label.dto';
import type { DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import type { ConformityViolation, JobWithRelations, ProductWithLabel } from './types';
import { findLabelForProduct, extractLabelFromExtraction } from './matchers';
import {
  ConformityCheckStep,
  ConformityDataSource,
  type JobHistoryManager,
} from './historyCollector';

// ============================================================================
// TYPES
// ============================================================================

interface SAGroupInfo {
  readonly groupKey: string;
  readonly maxTreatments: number;
  readonly scope: string | null;
  readonly activeIngredients: readonly string[];
  readonly sourceSA: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extracts active ingredients from a label
 */
function extractActiveIngredientsFromLabel(label: Label | null): readonly string[] {
  if (!label) return [];
  const raw = (label as unknown as Record<string, unknown>).principio_attivo;
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[+,]/)
    .map((s) => normalizeActiveIngredient(s))
    .filter((s) => s.length > 0);
}

/**
 * Builds SA group info from disciplinare extracted data.
 * Each DisciplinareActiveIngredientInfo may contain group SA limits.
 */
function buildSAGroupsFromDisciplinareInfo(
  disciplinareInfoMap: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>,
): Map<string, SAGroupInfo> {
  const saGroupsMap = new Map<string, SAGroupInfo>();

  for (const [aiKey, infos] of disciplinareInfoMap) {
    for (const info of infos) {
      // Group-level limit (shared among multiple SAs)
      if (
        info.n_max_interventi_gruppo != null &&
        info.n_max_interventi_gruppo > 0 &&
        info.gruppo_sostanze_attive.length > 0
      ) {
        // Build a stable group key from sorted member names
        const members = [...info.gruppo_sostanze_attive]
          .map((s) => normalizeActiveIngredient(s))
          .filter((s) => s.length > 0)
          .sort();
        const groupKey = `group:${members.join('|')}`;

        if (!saGroupsMap.has(groupKey)) {
          saGroupsMap.set(groupKey, {
            groupKey,
            maxTreatments: info.n_max_interventi_gruppo,
            scope: info.n_max_interventi_gruppo_scope ?? null,
            activeIngredients: members,
            sourceSA: aiKey,
          });
        }
      }

      // Individual SA limit
      if (info.n_max_interventi_sa != null && info.n_max_interventi_sa > 0) {
        const normalizedSA = normalizeActiveIngredient(info.sostanza_attiva || aiKey);
        const saKey = `sa:${normalizedSA}`;

        if (!saGroupsMap.has(saKey)) {
          saGroupsMap.set(saKey, {
            groupKey: saKey,
            maxTreatments: info.n_max_interventi_sa,
            scope: info.n_max_interventi_sa_scope ?? null,
            activeIngredients: [normalizedSA],
            sourceSA: aiKey,
          });
        }
      }
    }
  }

  return saGroupsMap;
}

/**
 * Checks if a product belongs to an SA group based on its active ingredients
 */
function productBelongsToGroup(
  productAIs: readonly string[],
  groupAIs: readonly string[],
): boolean {
  return productAIs.some((pai) =>
    groupAIs.some((gai) => pai === gai || pai.includes(gai) || gai.includes(pai)),
  );
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Checks SA group treatment limits for all jobs using company's disciplinari rules.
 *
 * Uses pre-extracted disciplinare info from rulesComplianceChecker.
 * If no disciplinare info is available, skips the check.
 *
 * Returns a Map of jobId -> violations (only for jobs that are over the limit).
 */
export async function checkSAGroupLimits(
  jobs: JobWithRelations[],
  labelByRegNumber: Map<string, ProductWithLabel['label']>,
  labelByProductName: Map<string, ProductWithLabel['label']>,
  disciplinareInfoMap: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>,
  historyManager?: JobHistoryManager,
): Promise<Map<string, ConformityViolation[]>> {
  const violationsByJobId = new Map<string, ConformityViolation[]>();

  if (disciplinareInfoMap.size === 0) {
    console.log('[SA-GROUP-CHECKER] No disciplinare info available, skipping SA group check');
    return violationsByJobId;
  }

  // Build SA groups map from disciplinare info
  const saGroupsMap = buildSAGroupsFromDisciplinareInfo(disciplinareInfoMap);

  if (saGroupsMap.size === 0) {
    console.log('[SA-GROUP-CHECKER] No SA group limits found in disciplinare info, skipping');
    return violationsByJobId;
  }

  console.log(
    `[SA-GROUP-CHECKER] Found ${saGroupsMap.size} SA group limits from disciplinare rules`,
  );

  // Group jobs by production unit
  const jobsByUnit = new Map<string, JobWithRelations[]>();
  for (const job of jobs) {
    const unitId = job.productionUnitId;
    if (!jobsByUnit.has(unitId)) jobsByUnit.set(unitId, []);
    jobsByUnit.get(unitId)!.push(job);
  }

  for (const [unitId, unitJobs] of jobsByUnit) {
    // Build product AI lookup for this unit
    const productAIsByKey = new Map<string, readonly string[]>();

    for (const job of unitJobs) {
      const product = job.stocks[0]?.product;
      if (!product) continue;

      const regNumber = product.registrationNumber ?? '';
      const productName = product.name ?? '';
      const productKey = buildProductKey(productName, regNumber);

      if (productAIsByKey.has(productKey)) continue;

      const labelExtraction = findLabelForProduct(
        regNumber,
        productName,
        labelByRegNumber as Map<string, ProductWithLabel['label']>,
        labelByProductName as Map<string, ProductWithLabel['label']>,
      );
      const label = extractLabelFromExtraction(labelExtraction);
      const activeIngredients = extractActiveIngredientsFromLabel(label);
      productAIsByKey.set(productKey, activeIngredients);
    }

    // Count treatments per SA group
    interface GroupCount {
      groupKey: string;
      currentCount: number;
      maxAllowed: number;
      contributingJobs: Array<{ jobId: string; productKey: string; productName: string }>;
    }

    const groupCounts = new Map<string, GroupCount>();

    for (const [key, group] of saGroupsMap) {
      groupCounts.set(key, {
        groupKey: group.groupKey,
        currentCount: 0,
        maxAllowed: group.maxTreatments,
        contributingJobs: [],
      });
    }

    // Count active treatments (quantity > 0) per product per group
    for (const job of unitJobs) {
      const product = job.stocks[0]?.product;
      if (!product || job.quantity <= 0) continue;

      const regNumber = product.registrationNumber ?? '';
      const productName = product.name ?? '';
      const productKey = buildProductKey(productName, regNumber);
      const productAIs = productAIsByKey.get(productKey) ?? [];

      for (const [key, group] of saGroupsMap) {
        if (productBelongsToGroup(productAIs, group.activeIngredients)) {
          const count = groupCounts.get(key)!;
          count.currentCount++;
          count.contributingJobs.push({ jobId: job.id, productKey, productName });
        }
      }
    }

    // Generate violations for over-limit groups
    for (const [, count] of groupCounts) {
      if (count.currentCount <= count.maxAllowed) continue;

      console.log(
        `[SA-GROUP-CHECKER] Unit ${unitId}: Group ${count.groupKey} has ${count.currentCount}/${count.maxAllowed} treatments`,
      );

      // Jobs beyond the limit get violations (preserve user order = priority)
      const excessJobs = count.contributingJobs.slice(count.maxAllowed);
      for (const excessJob of excessJobs) {
        const violation: ConformityViolation = {
          type: 'SA_GROUP_LIMIT_EXCEEDED',
          message: `Superato limite gruppo SA "${count.groupKey}": ${count.currentCount}/${count.maxAllowed} trattamenti. Questo intervento è in eccesso rispetto al limite disciplinari.`,
          severity: 'ERROR',
          source: 'RULES_RAG',
          field: 'sa_group',
          currentValue: count.currentCount,
          expectedValue: count.maxAllowed,
        };

        if (!violationsByJobId.has(excessJob.jobId)) {
          violationsByJobId.set(excessJob.jobId, []);
        }
        violationsByJobId.get(excessJob.jobId)!.push(violation);

        // Log to history
        if (historyManager) {
          historyManager.addEntry(
            unitId,
            excessJob.productKey,
            'Superato limite trattamenti gruppo SA',
            `Gruppo ${count.groupKey}: ${count.currentCount}/${count.maxAllowed} (da disciplinare aziendale)`,
            ConformityCheckStep.SA_GROUP_CHECK,
            ConformityDataSource.RULES_RAG,
            {
              productionUnitId: unitId,
              productName: excessJob.productName,
            },
          );
        }
      }
    }
  }

  return violationsByJobId;
}
