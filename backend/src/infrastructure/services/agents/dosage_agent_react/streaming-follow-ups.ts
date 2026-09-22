import type { WorkingMemory } from './type/state';
import type { SupportedLanguage } from './language-detector';

/**
 * A follow-up suggestion the frontend renders as a quick-action button.
 */
export interface FollowUpSuggestion {
  readonly id: string;
  readonly text: string;
  readonly action: string;
}

interface LocalizedSuggestion {
  readonly text: string;
  readonly action: string;
}

type SuggestionId =
  | 'suggest_compliance'
  | 'suggest_fix_violations'
  | 'suggest_generate_plan'
  | 'suggest_execute_plan'
  | 'suggest_stock_check'
  | 'suggest_view_archive_group';

const SUGGESTIONS: Readonly<
  Record<SuggestionId, Readonly<Record<SupportedLanguage, LocalizedSuggestion>>>
> = {
  suggest_compliance: {
    it: {
      text: 'Vuoi verificare la conformità ai disciplinari regionali?',
      action:
        'Verifica la conformità dei dosaggi calcolati rispetto ai disciplinari della mia regione.',
    },
    en: {
      text: 'Want to verify compliance with regional protocols?',
      action: "Verify the compliance of the calculated dosages against my region's protocols.",
    },
  },
  suggest_fix_violations: {
    it: {
      text: 'Vuoi correggere automaticamente i trattamenti non conformi?',
      action:
        'Correggi automaticamente i trattamenti non conformi trovati nella verifica di conformità.',
    },
    en: {
      text: 'Want to automatically fix the non-compliant treatments?',
      action: 'Automatically fix the non-compliant treatments found in the compliance check.',
    },
  },
  suggest_generate_plan: {
    it: {
      text: 'Vuoi generare un piano di trattamento?',
      action: 'Genera un piano di trattamento basato sui dosaggi calcolati.',
    },
    en: {
      text: 'Want to generate a treatment plan?',
      action: 'Generate a treatment plan based on the calculated dosages.',
    },
  },
  suggest_execute_plan: {
    it: {
      text: 'Vuoi eseguire il piano di trattamento?',
      action: 'Esegui il piano di trattamento appena generato.',
    },
    en: {
      text: 'Want to execute the treatment plan?',
      action: 'Execute the treatment plan just generated.',
    },
  },
  suggest_stock_check: {
    it: {
      text: 'Vuoi verificare la disponibilità in magazzino?',
      action: 'Verifica se il magazzino ha scorte sufficienti per i trattamenti pianificati.',
    },
    en: {
      text: 'Want to check stock availability?',
      action: 'Check if the warehouse has sufficient stock for the planned treatments.',
    },
  },
  // Populated dynamically with the freshly-created Job.jobId — the FE renders
  // `action` starting with `navigate:` as an in-app link instead of a chat reply.
  suggest_view_archive_group: {
    it: {
      text: 'Vai al gruppo in Archivio per validare i job',
      action: 'navigate:/archive/jobs/__GROUP__',
    },
    en: {
      text: 'Go to the archive group to validate the jobs',
      action: 'navigate:/archive/jobs/__GROUP__',
    },
  },
};

function buildSuggestion(id: SuggestionId, language: SupportedLanguage): FollowUpSuggestion {
  const localized = SUGGESTIONS[id][language];
  return { id, text: localized.text, action: localized.action };
}

/**
 * Analyzes working memory after an agent turn and generates contextual follow-up suggestions.
 * Returns an empty array if no follow-ups are appropriate.
 *
 * @param language locale used to render the suggestion text and action. Defaults to 'it'.
 */
export function generateFollowUpSuggestions(
  workingMemory: WorkingMemory,
  executedToolNames: ReadonlyArray<string>,
  language: SupportedLanguage = 'it',
): readonly FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];

  const hasDosageResults = !!workingMemory.dosageResults?.length;
  const hasComplianceResult = !!workingMemory.complianceResult;
  const hasViolations = (workingMemory.complianceResult?.violations?.length ?? 0) > 0;
  const hasActivePlan = !!workingMemory.activePlan;
  const hasStockBalance = !!workingMemory.stockBalance;
  const ranConformityCheck = executedToolNames.includes('run_conformity_check');

  // After dosage calculation without compliance check
  if (hasDosageResults && !hasComplianceResult) {
    suggestions.push(buildSuggestion('suggest_compliance', language));
  }

  // After compliance check with violations
  if (hasViolations) {
    suggestions.push(buildSuggestion('suggest_fix_violations', language));
  }

  // After dosage with plan but not yet executed
  if (hasDosageResults && !hasActivePlan) {
    suggestions.push(buildSuggestion('suggest_generate_plan', language));
  }

  // After plan generation (not yet executed)
  if (hasActivePlan) {
    suggestions.push(buildSuggestion('suggest_execute_plan', language));
  }

  // After conformity check without stock check
  if (ranConformityCheck && !hasStockBalance) {
    suggestions.push(buildSuggestion('suggest_stock_check', language));
  }

  // After create_treatment_jobs: deep-link to the freshly-created group in Archivio
  if (workingMemory.lastCreatedJobGroupId && executedToolNames.includes('create_treatment_jobs')) {
    const tpl = buildSuggestion('suggest_view_archive_group', language);
    suggestions.unshift({
      ...tpl,
      action: tpl.action.replace('__GROUP__', workingMemory.lastCreatedJobGroupId),
    });
  }

  // Limit to 3 suggestions max
  return suggestions.slice(0, 3);
}
