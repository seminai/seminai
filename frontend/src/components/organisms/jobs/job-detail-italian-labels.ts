/** Italian UI labels for job / API field keys (no English labels shown to users). */

export const JOB_FIELD_LABEL_IT: Readonly<Record<string, string>> = {
  id: 'ID operazione',
  jobId: 'ID gruppo job',
  productionUnitId: 'ID unità produttiva',
  productionCycleId: 'ID ciclo produttivo',
  dateOfOpeation: 'Data operazione',
  dateOfOperation: 'Data operazione',
  isVerified: 'Verificata',
  conformityChecked: 'Conformità controllata',
  category: 'Categoria',
  quantity: 'Quantità',
  unitOfMeasureQuantity: 'Unità di misura (quantità)',
  productQuantityTreated: 'Quantità prodotto distribuito',
  unitOfMeasureProductQuantityTreated: 'Unità di misura (prodotto trattato)',
  modeOfApplication: 'Modalità di applicazione',
  avversity: 'Avversità',
  giustification: 'Giustificazione',
  treatedSurface: 'Superficie trattata',
  isLocalizedTreatment: 'Trattamento localizzato',
  userId: 'ID utente',
  note: 'Note',
  alertNotes: 'Avvisi',
  history: 'Cronologia',
  totalDistributedWaterL: 'Acqua distribuita (litri)',
  machineId: 'ID macchina',
  createdAt: 'Creata il',
  updatedAt: 'Aggiornata il',
  step: 'Fase',
  title: 'Titolo',
  value: 'Esito / dettaglio',
  source: 'Origine',
  timestamp: 'Data e ora',
  type: 'Tipo evento',
  changes: 'Modifiche',
  modifiedBy: 'Modificato da',
  name: 'Nome',
  email: 'Email',
  field: 'Campo',
  newValue: 'Valore nuovo',
  oldValue: 'Valore precedente',
  metadata: 'Dettagli tecnici',
  excluded_product: 'Prodotto escluso',
  exclusion_reason: 'Motivo esclusione',
  product_category: 'Categoria prodotto (fitosanitario)',
  message: 'Messaggio',
  cropName: 'Coltura',
  cropType: 'Tipo coltura',
  sauHa: 'SAU (ettari)',
  registrationNumber: 'Numero di registrazione',
  description: 'Descrizione',
  productName: 'Prodotto',
  companyName: 'Azienda',
  companyId: 'ID azienda',
  productionUnitName: 'Unità produttiva',
  variety: 'Varietà',
  areaHa: 'Superficie (ha)',
  productId: 'ID prodotto',
  productRegistrationNumber: 'Numero registrazione prodotto',

  dose_um: 'Unità di misura dose',
  dose_minima: 'Dose minima',
  dose_massima: 'Dose massima',
  dose_minima_hl_job: 'Dose minima per ettolitro',
  dose_massima_hl_job: 'Dose massima per ettolitro',
  acqua_max: 'Acqua massima ammessa',
  acqua_max_um: 'Unità di misura acqua massima',
  waterHlJob: 'Acqua per ettolitro (job)',
  acquaMaxJob: 'Acqua massima del job',
  acquaMaxJob_um: 'Unità di misura acqua del job',
  n_max_applicazioni: 'Numero massimo applicazioni',
  n_max_applicazioni_um: 'Unità misura applicazioni',
  modalita_applicazione: 'Modalità di applicazione',
  epoca_impiego: 'Epoca di impiego',
  epoca_impiego_llm: 'Epoca di impiego (analisi LLM)',
  principio_attivo: 'Principio attivo',
  note_tecniche: 'Note tecniche',
  malattie: 'Malattie / patologie',
  frasi_pericolo: 'Frasi di pericolo',
  resistenze: 'Resistenze',
  resistenze_llm: 'Resistenze (analisi LLM)',
  fasce_di_rispetto_e_deriva: 'Fasce di rispetto e deriva',
  fasce_di_rispetto_e_deriva_llm: 'Fasce di rispetto e deriva (analisi LLM)',
  fasce_rispetto_acqua: 'Fasce di rispetto da corpi idrici',
  fasce_rispetto_colture: 'Fasce di rispetto da altre colture',
  colture_target_fuori_periodo_di_produzione: 'Colture target fuori periodo',
  colture_target_fuori_periodo_di_produzione_llm: 'Colture target fuori periodo (LLM)',
  stock_out: 'Stock prelevato',
  stock_out_um: 'Unità di misura stock prelevato',
  stock_in_warehouse: 'Giacenza in magazzino',
  stock_in_warehouse_um: 'Unità di misura giacenza',
  total_stock_required_for_jobs: 'Stock totale richiesto',
  total_stock_required_for_jobs_um: 'Unità misura stock richiesto',
  ddt_date_is_ok: 'Data DDT conforme',
  ddt_date_conformity: 'Conformità data DDT',
  ddt_date_after_treatment: 'DDT successivo al trattamento',
  ruleViolations: 'Violazioni regole',
  ruleComplianceNotes: 'Note conformità regole',
  disciplinare_info: 'Informazioni disciplinare',

  testo_completo: 'Testo completo',
  raccomandazioni: 'Raccomandazioni',
};

export function jobFieldLabelIt(fieldKey: string): string {
  return JOB_FIELD_LABEL_IT[fieldKey] ?? fieldKey.replace(/_/g, ' ');
}

export function jobCategoryIt(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'TREATMENT') return 'Trattamento';
  if (normalized === 'FERTILIZATION') return 'Concimazione';
  if (normalized === 'SEEDING') return 'Semina';
  return code.trim() || '—';
}

export function boolIta(value: unknown): string {
  if (value === true) return 'Sì';
  if (value === false) return 'No';
  return '—';
}

export function dataSourceIt(source: string): string {
  const s = source.trim().toLowerCase();
  if (s === 'llm_openai') return 'Motore linguistico (OpenAI)';
  if (s === 'user') return 'Utente';
  if (s === 'system') return 'Sistema';
  return source.trim() || '—';
}

export function conformitySnapshotStatusIt(status: string): string {
  const key = status.trim().toLowerCase();
  const map: Readonly<Record<string, string>> = {
    idle: 'In attesa',
    streaming: 'In elaborazione',
    requires_approval: 'Richiede approvazione',
    completed: 'Completata',
    error: 'Errore',
  };
  return map[key] ?? status;
}
