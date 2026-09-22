export interface ValidationResult {
  unitId: string;
  productName: string;
  regNumber: string;

  // 1. ACCURATEZZA LEGALE (Hard Constraints vs Disciplinari/Etichetta)
  compliance: {
    isCompliant: boolean; // TRUE se rispetta tutti i limiti noti
    score: number; // 0-100 (100 = perfetto rispetto etichetta)
    violations: string[]; // Es. "Dose > Max", "Troppe applicazioni"
    limitUsed?: string; // Es. "Max 4kg/ha"
  };

  // 2. PLAUSIBILITÀ AGRONOMICA (Soft Constraints vs Ground Truth)
  plausibility: {
    score: number; // 0-100 (Quanto è simile allo storico?)
    dateOffsetDays: number | null; // Distanza in giorni dalla data GT (media se multipli)
    doseDiffPercent: number | null; // Differenza % di dose
    isPhenologyMatch: boolean; // Stessa fase fenologica? (Se disponibile)
    verdict: 'EXACT' | 'PLAUSIBLE' | 'DIFFERENT_STRATEGY' | 'WRONG' | 'NO_MATCH';
    details: string;
  };

  // 3. COMPLIANCE DOSAGGI vs ETICHETTA (Verifica dose nel range label)
  labelDosage?: {
    isCompliant: boolean; // TRUE se tutte le dosi sono nel range etichetta
    score: number; // 0-100 (% trattamenti nel range)
    treatmentsInRange: number; // Quanti trattamenti hanno dose nel range
    totalTreatments: number; // Totale trattamenti con dose
    doseRange?: { min: number; max: number; unit: string }; // Range dall'etichetta
    violations: string[]; // Elenco violazioni
  };
}

export interface TreatmentComparisonInput {
  ai: {
    date?: Date;
    dose?: number;
    unit?: string;
    phenology?: string;
  };
  gt: {
    date?: Date;
    dose?: number;
    unit?: string;
    phenology?: string;
  };
}
