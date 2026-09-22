import { runFlows } from './index';
import type { DisciplinariContext } from './types';
import { createVectorSearchQdrantService } from '../../tool/vectorSearchQdrant';
import { extractDisciplinariChunkLimits } from './disciplinari-chunk-limits-extractor';
import { ApplicationLimits, DosageLimits, buildEnrichedQueryContext, extractDiseasesFromProduct, extractRegionFromAddress } from './flowMatchDosageInDisciplinari.part-01-application-limits';

/**
 * Verifica e arricchisce i risultati del dosage agent con informazioni dai disciplinari
 * utilizzando la ricerca vettoriale.
 *
 * @param input - Output del runFlows contenente outcome, outcomeWithDosage e stockBalance
 * @param address - Indirizzo opzionale per filtrare i disciplinari per regione
 * @returns Lo stesso output arricchito con validazioni dai disciplinari
 */
export const flowMatchDosageInDisciplinari = async (
  input: Awaited<ReturnType<typeof runFlows>>,
  address?: string,
  disciplinariContext?: DisciplinariContext,
): Promise<Awaited<ReturnType<typeof runFlows>>> => {
  console.log('\n[DISCIPLINARI] ═══════════════════════════════════════════════════════════');
  console.log('[DISCIPLINARI] VERIFICA DOSAGGI CONTRO DISCIPLINARI DI PRODUZIONE');
  console.log('[DISCIPLINARI] ═══════════════════════════════════════════════════════════');
  const qdrantService = createVectorSearchQdrantService('disciplinari_bdf');
  const MAX_RESULTS = 10;
  const SCORE_THRESHOLD = 0.6;
  const region = address ? extractRegionFromAddress(address) : undefined;
  if (region) {
    console.log(`[DISCIPLINARI] Regione identificata: ${region}`);
  } else if (address) {
    console.log(`[DISCIPLINARI] Regione non identificata dall'indirizzo: ${address}`);
  } else {
    console.log('[DISCIPLINARI] Nessun indirizzo fornito, ricerca generica');
  }
  const consultedResources = new Set<string>();
  let totalViolations = 0;
  for (const unit of input.outcomeWithDosage) {
    const cropName = unit.cropName || 'N/A';
    const variety = unit.variety || '';
    console.log(`\n[DISCIPLINARI] ─────────────────────────────────────────────────────────────`);
    console.log(
      `[DISCIPLINARI] 🌾 Unità: ${unit.unitProductionId} | Coltura: ${cropName} ${variety}`.trim(),
    );
    if (!unit.products || unit.products.length === 0) {
      console.log('[DISCIPLINARI]    ⚠️  Nessun prodotto da verificare');
      continue;
    }
    for (const product of unit.products) {
      const productName = product.name || 'N/A';
      const regNumber = product.regNumber || '';
      const diseases = extractDiseasesFromProduct(product);
      const enrichedQueryContext = buildEnrichedQueryContext({
        diseases,
        agronomicNotes: disciplinariContext?.agronomicNotes,
        priorityTargets: disciplinariContext?.priorityTargets,
      });
      console.log(`\n[DISCIPLINARI]    📦 Prodotto: ${productName} (${regNumber})`);
      if (enrichedQueryContext) {
        console.log(`[DISCIPLINARI]       Contesto aggiuntivo: ${enrichedQueryContext}`);
      }
      if (!product.trattamenti || product.trattamenti.length === 0) {
        console.log('[DISCIPLINARI]       ⚠️  Nessun trattamento da verificare');
        continue;
      }
      const totalTreatments = product.trattamenti.length;
      console.log(`[DISCIPLINARI]       🔢 Numero trattamenti: ${totalTreatments}`);
      for (const treatment of product.trattamenti) {
        const epoca = treatment.epoca_impiego || 'N/A';
        const dose = treatment.dose;
        const unit = treatment.dosaggio_um || '';
        console.log(`\n[DISCIPLINARI]       🕒 Epoca: ${epoca} | Dose: ${dose} ${unit}`.trim());
        try {
          const regionFilter = region ? ` Regione ${region}.` : '';
          const queryApplications =
            `Disciplinare produzione integrata ${cropName} ${variety}. Prodotto ${productName} ${regNumber}.${regionFilter} Numero massimo applicazioni permesse per anno o ciclo. Intervallo minimo giorni tra trattamenti. ${enrichedQueryContext}`.trim();
          console.log(
            `[DISCIPLINARI]       Query tempistiche: "${queryApplications.substring(0, 80)}..."`,
          );
          const resultsApplications = await qdrantService.similaritySearchWithScore(
            queryApplications,
            MAX_RESULTS,
          );
          let maxApplications: number | undefined;
          let minIntervalDays: number | undefined;
          const appLimits: ApplicationLimits[] = [];
          for (const [document, score] of resultsApplications) {
            if (score < SCORE_THRESHOLD) {
              continue;
            }
            if (document.metadata.source) {
              consultedResources.add(document.metadata.source as string);
            }
            const limits = await extractDisciplinariChunkLimits({
              text: document.pageContent,
              kind: 'applications',
              context: {
                productName,
                cropName,
                variety,
                epoca,
                region,
              },
            });
            if (limits.maxApplications !== null) {
              appLimits.push({
                maxApplications: limits.maxApplications,
                source: document.metadata.source as string,
                score: score,
              });
            }
            if (limits.minIntervalDays !== null) {
              appLimits.push({
                minIntervalDays: limits.minIntervalDays,
                source: document.metadata.source as string,
                score: score,
              });
            }
          }
          if (appLimits.length > 0) {
            const maxApps = appLimits.map((l) => l.maxApplications).filter(Boolean) as number[];
            const intervals = appLimits.map((l) => l.minIntervalDays).filter(Boolean) as number[];
            if (maxApps.length > 0) {
              maxApplications = Math.min(...maxApps);
            }
            if (intervals.length > 0) {
              minIntervalDays = Math.max(...intervals);
            }
          }
          if (maxApplications !== undefined) {
            console.log(
              `[DISCIPLINARI]       ✅ Limite applicazioni trovato: max ${maxApplications} volte`,
            );
            if (totalTreatments > maxApplications) {
              console.log(
                `[DISCIPLINARI]       ❌ VIOLAZIONE: ${totalTreatments} trattamenti > ${maxApplications} consentiti`,
              );
              totalViolations++;
              if (!treatment.note) {
                (treatment as { note: string }).note = '';
              }
              (treatment as { note: string }).note +=
                ` [DISCIPLINARE] Superato limite applicazioni: ${totalTreatments}/${maxApplications}.`;
            } else {
              console.log(`[DISCIPLINARI]       ✅ OK: ${totalTreatments} ≤ ${maxApplications}`);
            }
          } else {
            console.log('[DISCIPLINARI]       ⚠️  Nessun limite di applicazioni trovato');
          }
          if (minIntervalDays !== undefined) {
            console.log(
              `[DISCIPLINARI]       ✅ Intervallo minimo trovato: ${minIntervalDays} giorni`,
            );
          }
        } catch (error) {
          console.error(`[DISCIPLINARI]       ❌ Errore ricerca tempistiche:`, error);
        }
        if (dose) {
          try {
            const regionFilter = region ? ` Regione ${region}.` : '';
            const queryDosage =
              `Disciplinare produzione integrata ${cropName} ${variety}. Prodotto ${productName} ${regNumber} epoca ${epoca}.${regionFilter} Dose massima consentita kg/ha L/ha. Limite massimo dosaggio per ettaro. ${enrichedQueryContext}`.trim();
            console.log(`[DISCIPLINARI]       Query dosaggi: "${queryDosage.substring(0, 80)}..."`);
            const resultsDosage = await qdrantService.similaritySearchWithScore(
              queryDosage,
              MAX_RESULTS,
            );
            let doseMin: number | undefined;
            let doseMax: number | undefined;
            let unitOfMeasure: string | undefined;
            const dosageLimits: DosageLimits[] = [];
            for (const [document, score] of resultsDosage) {
              if (score < SCORE_THRESHOLD) {
                continue;
              }
              if (document.metadata.source) {
                consultedResources.add(document.metadata.source as string);
              }
              const limits = await extractDisciplinariChunkLimits({
                text: document.pageContent,
                kind: 'dosage',
                context: {
                  productName,
                  cropName,
                  variety,
                  epoca,
                  region,
                },
              });
              if (limits.doseMax !== null) {
                dosageLimits.push({
                  doseMax: limits.doseMax,
                  unitOfMeasure: limits.unitOfMeasure?.toLowerCase() ?? undefined,
                  source: document.metadata.source as string,
                  score: score,
                });
              }
              if (limits.doseMin !== null) {
                dosageLimits.push({
                  doseMin: limits.doseMin,
                  unitOfMeasure: limits.unitOfMeasure?.toLowerCase() ?? undefined,
                  source: document.metadata.source as string,
                  score: score,
                });
              }
            }
            if (dosageLimits.length > 0) {
              const maxDoses = dosageLimits.map((l) => l.doseMax).filter(Boolean) as number[];
              const minDoses = dosageLimits.map((l) => l.doseMin).filter(Boolean) as number[];
              const units = dosageLimits.map((l) => l.unitOfMeasure).filter(Boolean) as string[];
              if (maxDoses.length > 0) {
                doseMax = Math.min(...maxDoses);
              }
              if (minDoses.length > 0) {
                doseMin = Math.max(...minDoses);
              }
              if (units.length > 0) {
                unitOfMeasure = units[0];
              }
            }
            if (doseMax !== undefined) {
              console.log(
                `[DISCIPLINARI]       ✅ Limite dosaggio trovato: max ${doseMax} ${unitOfMeasure || unit}`,
              );
              if (dose > doseMax) {
                console.log(
                  `[DISCIPLINARI]       ❌ VIOLAZIONE: ${dose} ${unit} > ${doseMax} ${unitOfMeasure || unit}`,
                );
                totalViolations++;
                if (!treatment.note) {
                  (treatment as { note: string }).note = '';
                }
                (treatment as { note: string }).note +=
                  ` [DISCIPLINARE] Dosaggio eccessivo: ${dose}/${doseMax} ${unitOfMeasure || unit}.`;
              } else {
                console.log(
                  `[DISCIPLINARI]       ✅ OK: ${dose} ≤ ${doseMax} ${unitOfMeasure || unit}`,
                );
              }
            } else {
              console.log('[DISCIPLINARI]       ⚠️  Nessun limite di dosaggio trovato');
            }
            if (doseMin !== undefined) {
              console.log(
                `[DISCIPLINARI]       ℹ️  Dose minima consigliata: ${doseMin} ${unitOfMeasure || unit}`,
              );
              if (dose < doseMin) {
                console.log(
                  `[DISCIPLINARI]       ⚠️  Attenzione: dose sotto il minimo consigliato`,
                );
              }
            }
          } catch (error) {
            console.error(`[DISCIPLINARI]       ❌ Errore ricerca dosaggi:`, error);
          }
        }
      }
    }
  }
  console.log('\n[DISCIPLINARI] ═══════════════════════════════════════════════════════════');
  console.log(`[DISCIPLINARI] 📊 RIEPILOGO VERIFICA`);
  console.log('[DISCIPLINARI] ═══════════════════════════════════════════════════════════');
  console.log(
    `[DISCIPLINARI] Regione: ${region || 'Non specificata'} | Violazioni: ${totalViolations}`,
  );
  console.log(`[DISCIPLINARI] Fonti consultate: ${consultedResources.size}`);
  if (consultedResources.size > 0) {
    console.log('[DISCIPLINARI] ');
    console.log('[DISCIPLINARI] 📚 Risorse consultate:');
    for (const resource of Array.from(consultedResources)) {
      console.log(`[DISCIPLINARI]    - ${resource}`);
    }
  }
  console.log('[DISCIPLINARI] ═══════════════════════════════════════════════════════════\n');
  return input;
};
