import type { ValidationResult } from './types';

export interface ComplianceCheckInput {
  productName: string;
  treatments: {
    dose?: number;
    note?: string;
    numApplications?: number; // Totale per il prodotto
  }[];
}

/**
 * Valuta la compliance legale basandosi sulle annotazioni lasciate
 * dal flowMatchDosageInDisciplinari o analizzando le note.
 */
export function evaluateCompliance(input: ComplianceCheckInput): ValidationResult['compliance'] {
  const violations: string[] = [];
  let isCompliant = true;
  const limitUsed = undefined;

  // Cerchiamo marcatori di violazione nelle note inseriti dall'agente disciplinari
  // Es: "VIOLAZIONE: 5 > 4 consentiti" o "Dosaggio eccessivo"

  for (const t of input.treatments) {
    if (t.note) {
      if (
        t.note.includes('VIOLAZIONE') ||
        t.note.includes('Dosaggio eccessivo') ||
        t.note.includes('Superato limite')
      ) {
        isCompliant = false;
        violations.push(t.note);
      }

      // Cerchiamo info sui limiti usati
      // Es: "Limite applicazioni trovato: max 2" (Questo solitamente è nei log, non nelle note del trattamento finale,
      // ma flowMatchDosageDisciplinari (la versione non-vector) scrive "[DISCIPLINARE] Dose ridotta da X a Y")

      if (t.note.includes('[DISCIPLINARE]')) {
        // Se c'è una nota disciplinare, significa che il controllo è avvenuto.
        // Se dice "Dose ridotta", tecnicamente l'output FINALE è compliant perché è stato corretto!
        // Ma se stiamo valutando la proposta *iniziale* dell'LLM prima della correzione, dovremmo flaggarlo.
        // Qui stiamo valutando l'output FINALE del sistema (quindi post-correzione).
        // Se è stato corretto, è Compliant (Score 100), ma magari vogliamo tracciare che è servito un intervento.
        // Tuttavia, la richiesta parla di accuratezza "legale". L'output finale DEVE essere legale.
        // Se leggiamo le note del trattamento in output:
        // Se c'è scritto "VIOLAZIONE" (dal flowMatchDosageInDisciplinari.ts vettoriale che NON corregge ma annota), allora è FAIL.
        // Se c'è scritto "Dose ridotta" (dal flowMatchDosageDisciplinari.ts deterministico che CORREGGE), allora è SUCCESS (il sistema ha funzionato).
      }
    }
  }

  return {
    isCompliant,
    score: isCompliant ? 100 : 0, // Binario per ora: o è legale o no
    violations,
    limitUsed,
  };
}
