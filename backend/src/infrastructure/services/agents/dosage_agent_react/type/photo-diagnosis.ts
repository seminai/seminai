/**
 * Structured result produced by `diagnose_from_photo`.
 */
export interface PhotoDiagnosis {
  readonly status: 'diagnosed' | 'unclear' | 'not_plant' | 'unsupported' | 'too_large' | 'failed';
  readonly candidates: ReadonlyArray<{
    readonly avversita: string;
    readonly nomeScientifico?: string | null;
    readonly confidence: number;
    readonly reasoning?: string;
    readonly tipo?: string;
  }>;
  readonly visibleSymptoms: ReadonlyArray<string>;
  readonly possibleCauses: ReadonlyArray<string>;
  readonly severity: 'low' | 'medium' | 'high' | 'unknown';
  readonly recommendedActions: ReadonlyArray<string>;
  readonly followUpQuestions: ReadonlyArray<string>;
  readonly cropGuess?: string | null;
  readonly notes?: string | null;
  readonly fileName?: string;
  readonly model?: string;
}
