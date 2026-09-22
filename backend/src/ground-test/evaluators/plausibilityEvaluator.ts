import type { ValidationResult, TreatmentComparisonInput } from './types';

const DATE_TOLERANCE_DAYS = 20; // Tolleranza ampia per "plausibilità"
const DOSE_TOLERANCE_PERCENT = 0.3; // 30% di tolleranza sulla dose

function normalizeUnit(u?: string): string {
  return u ? u.toLowerCase().trim().replace(/\s+/g, '') : '';
}

function differenceInDays(dateLeft: Date, dateRight: Date): number {
  const diffTime = Math.abs(dateLeft.getTime() - dateRight.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function evaluatePlausibility(
  aiTreatments: TreatmentComparisonInput['ai'][],
  gtTreatments: TreatmentComparisonInput['gt'][],
): ValidationResult['plausibility'] {
  if (gtTreatments.length === 0) {
    // Se non c'è GT, non possiamo valutare la plausibilità rispetto allo storico
    // Se AI ha generato qualcosa, è una "Strategia Diversa" (forse necessaria)
    return {
      score: aiTreatments.length > 0 ? 50 : 100, // Se AI non fa nulla come GT, è 100% match
      dateOffsetDays: null,
      doseDiffPercent: null,
      isPhenologyMatch: false,
      verdict: aiTreatments.length > 0 ? 'DIFFERENT_STRATEGY' : 'EXACT',
      details: 'Nessun trattamento nel Ground Truth',
    };
  }

  if (aiTreatments.length === 0) {
    return {
      score: 0,
      dateOffsetDays: null,
      doseDiffPercent: null,
      isPhenologyMatch: false,
      verdict: 'WRONG', // GT ha trattato, AI no
      details: 'AI non ha pianificato trattamenti presenti nel GT',
    };
  }

  // Strategia semplice: Match Best-Effort
  // Cerchiamo di accoppiare ogni trattamento AI al GT più vicino temporalmente

  let totalDateScore = 0;
  let totalDoseScore = 0;
  let matchCount = 0;
  let totalDaysOffset = 0;
  let totalDoseDiff = 0;
  const coveredGtIndices = new Set<number>();

  for (const aiT of aiTreatments) {
    if (!aiT.date) continue;

    // Trova il GT più vicino
    let bestGtMatch: TreatmentComparisonInput['gt'] | null = null;
    let bestGtIndex = -1;
    let minDaysDiff = Infinity;

    for (let i = 0; i < gtTreatments.length; i++) {
      const gtT = gtTreatments[i];
      if (!gtT.date) continue;
      const diff = Math.abs(differenceInDays(aiT.date, gtT.date));
      if (diff < minDaysDiff) {
        minDaysDiff = diff;
        bestGtMatch = gtT;
        bestGtIndex = i;
      }
    }

    if (bestGtMatch && minDaysDiff <= 60) {
      // Consideriamo match solo se entro 2 mesi (stagionalità)
      matchCount++;
      if (bestGtIndex !== -1) coveredGtIndices.add(bestGtIndex);

      // Score Data
      let dateScore = 0;
      if (minDaysDiff <= 7) dateScore = 100;
      else if (minDaysDiff <= DATE_TOLERANCE_DAYS) dateScore = 80;
      else dateScore = Math.max(0, 100 - (minDaysDiff - DATE_TOLERANCE_DAYS) * 2);

      totalDateScore += dateScore;
      totalDaysOffset += minDaysDiff;

      // Score Dose
      let doseScore = 0;
      let doseDiff = 0;
      if (aiT.dose !== undefined && bestGtMatch.dose !== undefined && bestGtMatch.dose > 0) {
        // Normalizza unità se possibile (qui assumiamo stessa unità o gestiamo conversioni basilari in futuro)
        if (normalizeUnit(aiT.unit) === normalizeUnit(bestGtMatch.unit)) {
          doseDiff = Math.abs(aiT.dose - bestGtMatch.dose) / bestGtMatch.dose;
          if (doseDiff <= 0.1) doseScore = 100;
          else if (doseDiff <= DOSE_TOLERANCE_PERCENT) doseScore = 80;
          else doseScore = Math.max(0, 100 - doseDiff * 100);
        } else {
          doseScore = 50; // Unità diverse, difficile confrontare senza converter
        }
        totalDoseDiff += doseDiff;
      } else {
        doseScore = 50; // Dati mancanti
      }
      totalDoseScore += doseScore;
    }
  }

  if (matchCount === 0) {
    return {
      score: 0,
      dateOffsetDays: null,
      doseDiffPercent: null,
      isPhenologyMatch: false,
      verdict: 'WRONG',
      details: 'Nessuna corrispondenza temporale trovata (fuori stagione)',
    };
  }

  const avgDateScore = totalDateScore / matchCount;
  const avgDoseScore = totalDoseScore / matchCount;
  const rawScore = avgDateScore * 0.6 + avgDoseScore * 0.4;

  // Calcolo Recall (copertura del GT)
  const recall = coveredGtIndices.size / gtTreatments.length;

  // Penalizza lo score finale basandosi sulla recall
  const finalScore = rawScore * recall;

  const avgOffset = totalDaysOffset / matchCount;
  const avgDoseDiffPercent = (totalDoseDiff / matchCount) * 100;

  let verdict: ValidationResult['plausibility']['verdict'] = 'WRONG';
  if (finalScore >= 90) verdict = 'EXACT';
  else if (finalScore >= 60) verdict = 'PLAUSIBLE';
  else verdict = 'WRONG'; // Precedentemente DIFFERENT_STRATEGY, ora WRONG per match scarsi

  return {
    score: Math.round(finalScore),
    dateOffsetDays: Math.round(avgOffset),
    doseDiffPercent: Math.round(avgDoseDiffPercent),
    isPhenologyMatch: false, // TODO: Implementare confronto stringhe fenologiche
    verdict,
    details: `Match su ${matchCount}/${aiTreatments.length} (AI) vs ${gtTreatments.length} (GT). Recall: ${Math.round(recall * 100)}%. Offset: ${Math.round(avgOffset)}gg`,
  };
}
