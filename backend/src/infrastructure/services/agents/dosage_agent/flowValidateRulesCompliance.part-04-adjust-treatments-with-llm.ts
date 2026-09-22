import { type TreatmentView } from './productAccessors';
import { RuleViolationDetail, DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import { createChatModel } from '../../llm-model-factory';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { AdjustTreatmentsResult } from './flowValidateRulesCompliance.part-03-build-applied-rules-for-product-in-flow';
import { TreatmentAdjustmentResult } from './flowValidateRulesCompliance.part-01-build-applied-rules-key';
import { formatViolationsAsNote } from './flowValidateRulesCompliance.part-05-extract-disciplinare-info';

export async function adjustTreatmentsWithLlm(params: {
  productName: string;
  activeIngredient: string;
  cropName: string;
  trattamenti: ReadonlyArray<TreatmentView>;
  disciplinareInfo: ReadonlyArray<DisciplinareActiveIngredientInfo>;
  violations: ReadonlyArray<RuleViolationDetail>;
  otherGroupProducts?: ReadonlyArray<{
    productName: string;
    activeIngredient: string;
    activeTreatmentCount: number;
  }>;
}): Promise<AdjustTreatmentsResult> {
  const {
    productName,
    activeIngredient,
    cropName,
    trattamenti,
    disciplinareInfo,
    violations,
    otherGroupProducts,
  } = params;

  const treatmentsSummary = trattamenti.map((t, i) => ({
    indice: i,
    data_distribuzione: t.data_distribuzione,
    dose: t.dose,
    dosaggio_um: t.dosaggio_um,
    epoca_impiego: t.application ?? t.epoca_impiego ?? null,
  }));

  const constraints = disciplinareInfo.map((info) => ({
    n_max_interventi_sa: info.n_max_interventi_sa,
    n_max_interventi_sa_scope: info.n_max_interventi_sa_scope,
    n_max_interventi_gruppo: info.n_max_interventi_gruppo,
    n_max_interventi_gruppo_scope: info.n_max_interventi_gruppo_scope,
    gruppo_sostanze_attive: info.gruppo_sostanze_attive,
    limitazioni_uso_e_note: info.limitazioni_uso_e_note,
  }));

  const violationsSummary = violations.map((v) => ({
    tipo: v.violationType,
    descrizione: v.description,
    azione_suggerita: v.suggestedAction,
  }));

  const prompt = `Sei un agronomo esperto di disciplinari di produzione integrata italiani.
Devi decidere come adeguare i trattamenti pianificati ai vincoli del disciplinare.

PRODOTTO: ${productName}
PRINCIPIO ATTIVO: ${activeIngredient}
COLTURA: ${cropName}

TRATTAMENTI PIANIFICATI (${trattamenti.length}):
${JSON.stringify(treatmentsSummary, null, 2)}

VINCOLI DAL DISCIPLINARE:
${JSON.stringify(constraints, null, 2)}

VIOLAZIONI RILEVATE DAL SISTEMA:
${JSON.stringify(violationsSummary, null, 2)}

CONTESTO GRUPPO SA:
${
  otherGroupProducts && otherGroupProducts.length > 0
    ? `Altre SA dello stesso gruppo presenti nel piano per questa unità produttiva:
${otherGroupProducts.map((p) => `- ${p.productName} (${p.activeIngredient}): ${p.activeTreatmentCount} trattamenti attivi`).join('\n')}
Totale trattamenti delle altre SA del gruppo: ${otherGroupProducts.reduce((s, p) => s + p.activeTreatmentCount, 0)}
IMPORTANTE: Il limite n_max_interventi_gruppo è CONDIVISO con queste SA! Devi sottrarre i loro trattamenti dal budget del gruppo.`
    : 'Nessuna altra SA dello stesso gruppo è presente nel piano per questa unità produttiva.'
}

REGOLE PER LA DECISIONE:
- n_max_interventi_sa = numero massimo di interventi per QUESTA singola sostanza attiva (o sottogruppo)
- n_max_interventi_gruppo = numero massimo di interventi CONDIVISI con le altre SA del gruppo
- Il limite effettivo per questa SA è: min(n_max_interventi_sa, n_max_interventi_gruppo - trattamenti_altre_SA_gruppo)
- Se n_max_interventi_sa è null, non c'è vincolo per singola SA
- Se n_max_interventi_gruppo è null, non c'è vincolo di gruppo
- Se entrambi sono null, tutti i trattamenti sono consentiti
- Mantieni i trattamenti nelle date agronomicamente più importanti (fasi critiche della coltura)
- Le violazioni rilevate dal sistema sono INDICATIVE: usa i vincoli strutturati del disciplinare come fonte autorevole

Rispondi con un JSON:
{{
  "max_trattamenti_consentiti": <numero massimo calcolato>,
  "indici_da_mantenere": [<indici 0-based dei trattamenti da tenere>],
  "motivazione": "<spiegazione della scelta>",
  "nota_per_agronomo": "<nota sintetica per l'utente>"
}}

Rispondi SOLO con il JSON, senza testo aggiuntivo.`;

  try {
    const { model: llm } = createChatModel({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 600,
    });
    const parser = new JsonOutputParser<TreatmentAdjustmentResult>();
    const chain = llm.pipe(parser);
    const result = await chain.invoke(prompt);

    // Validate indices: filter out any that are out of bounds
    const validIndices = (result.indici_da_mantenere || []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < trattamenti.length,
    );
    if (validIndices.length !== (result.indici_da_mantenere || []).length) {
      console.warn(
        `[RULES-COMPLIANCE] LLM returned invalid treatment indices for ${productName}. ` +
          `Valid range: 0-${trattamenti.length - 1}, got: ${JSON.stringify(result.indici_da_mantenere)}. ` +
          `Using only valid indices: ${JSON.stringify(validIndices)}`,
      );
    }
    const keepIndices = new Set(validIndices);

    const rawMaxAllowed = Number(result.max_trattamenti_consentiti);
    const maxAllowed =
      Number.isInteger(rawMaxAllowed) && rawMaxAllowed >= 0 ? rawMaxAllowed : trattamenti.length;

    console.log(
      `[RULES-COMPLIANCE] LLM adjustment for ${productName}: keep ${keepIndices.size}/${trattamenti.length} treatments (limit: ${maxAllowed}). ${result.motivazione}`,
    );

    const summary = {
      motivazione: result.motivazione ?? '',
      notaPerAgronomo: result.nota_per_agronomo ?? '',
    };

    if (keepIndices.size === trattamenti.length) {
      // LLM says all treatments are fine — just add informational note
      const infoNote = `[DISCIPLINARE] ${result.nota_per_agronomo || result.motivazione}`;
      const trattamentiOut = trattamenti.map((t) => ({
        ...t,
        note: [t.note, infoNote].filter(Boolean).join('\n'),
      }));
      return { trattamenti: trattamentiOut, summary };
    }

    const adjustmentNote = `[ADEGUAMENTO DISCIPLINARE] ${result.motivazione}`;
    const noteText = formatViolationsAsNote(violations);

    const trattamentiOut = trattamenti.map((t, index) => {
      const existingNote = t.note;
      if (keepIndices.has(index)) {
        return {
          ...t,
          note: [existingNote, adjustmentNote].filter(Boolean).join('\n'),
        };
      }
      const excessNote = `[ESCLUSO DA DISCIPLINARE] ${result.nota_per_agronomo || 'Trattamento in eccesso rimosso per conformità al disciplinare.'}\n${noteText}`;
      return {
        ...t,
        dose: 0,
        note: [existingNote, excessNote].filter(Boolean).join('\n'),
      };
    });
    return { trattamenti: trattamentiOut, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RULES-COMPLIANCE] LLM adjustment failed for ${productName}: ${msg}`);
    // Fallback: keep all treatments with violation notes (don't zero without reliable data)
    const noteText = formatViolationsAsNote(violations);
    const trattamentiOut = trattamenti.map((t) => ({
      ...t,
      note: [t.note, `[VIOLAZIONE NON RISOLTA] ${noteText}`].filter(Boolean).join('\n'),
    }));
    return { trattamenti: trattamentiOut };
  }
}
