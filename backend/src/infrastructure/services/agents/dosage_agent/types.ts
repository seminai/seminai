import { ProductionUnit, Field, LlmJobType } from '@prisma/client';
import { FindLabelExtractionInput } from 'src/domain/repositories/ILabelExtractionRepository';
import type { DosageStrategy } from './flowMatchProductionUnitTreatmentDosage';

export interface FindLabelExtractionInputWithDosage extends FindLabelExtractionInput {
  quantity: number;
  quantityUnitOfMeasure: string;
  /**
   * Optional dosage strategy for this specific product.
   * If omitted, the global input strategy is used.
   */
  strategy?: DosageStrategy;
  /**
   * Controlla se creare un movimento di stock IN per questo prodotto.
   *
   * - `true`: il prodotto deve essere caricato a magazzino, viene creato stock IN con la quantity specificata.
   * - `false`: il prodotto è già presente in magazzino, NON viene creato stock IN.
   * - `undefined` (default): come `false`, NON viene creato stock IN.
   *
   * Per creare movimenti IN, impostare esplicitamente `loadWarehouse: true`.
   */
  loadWarehouse?: boolean;
  supplierName?: string;
  supplierVat?: string;
  /**
   * Superficie effettiva da trattare (in ettari).
   * Usata solo se isLocalizedTreatment === true; altrimenti si usa l'area dell'unità (a pieno campo).
   * Deve essere > 0 e ≤ areaHa dell'unità di produzione.
   */
  treatedAreaHa?: number;
  /**
   * Trattamento localizzato vs a pieno campo.
   * - false o undefined: a pieno campo → il prodotto è distribuito su tutta la superficie dell'appezzamento (areaHa dell'unità).
   * - true: localizzato → si usa treatedAreaHa come superficie trattata (porzione del campo).
   */
  isLocalizedTreatment?: boolean;
  /**
   * Giacenza da raggiungere: quantità di prodotto da mantenere in magazzino dopo l'ottimizzazione.
   * Se specificata, lo stock effettivo per l'ottimizzazione è: disponibile - targetStock.
   * Se non specificata una strategy per il prodotto, viene usata 'current' come default.
   * L'unità di misura è la stessa di quantityUnitOfMeasure.
   */
  targetStock?: number;
}

/**
 * Configurazione per l'orchestratore di selezione prodotti.
 * Controlla quanti e quali prodotti vengono effettivamente pianificati per evitare
 * l'esplosione combinatoria di job.
 */
export interface OrchestratorConfig {
  /**
   * Obiettivo principale della pianificazione
   * - 'minimize_interventions': meno trattamenti possibili (pressione bassa)
   * - 'maximize_coverage': massima copertura avversità (pressione alta)
   * - 'balanced': equilibrio tra copertura e numero interventi (default)
   * - 'cost_effective': minimizza costo/ha mantenendo copertura base
   */
  readonly objective?:
    | 'minimize_interventions'
    | 'maximize_coverage'
    | 'balanced'
    | 'cost_effective';

  /**
   * Intensità della protezione fitosanitaria
   * - 'low': solo trattamenti essenziali (1-3 prodotti/unità)
   * - 'medium': copertura standard (4-6 prodotti/unità)
   * - 'high': copertura intensiva (7-10 prodotti/unità)
   *
   * Se non specificata (undefined), NON applica alcun limite implicito: l'LLM può selezionare liberamente.
   */
  readonly intensity?: 'low' | 'medium' | 'high';

  /**
   * Massimo numero di prodotti diversi per unità produttiva.
   * Se non specificato, usa il default basato su intensity (se intensity è definita).
   * Se né maxProductsPerUnit né intensity sono specificati, NON viene applicato alcun limite.
   */
  readonly maxProductsPerUnit?: number;

  /**
   * Massimo numero di applicazioni per prodotto per unità.
   * Default: null (nessun cap extra; si rispettano solo i vincoli di etichetta).
   */
  readonly maxApplicationsPerProductPerUnit?: number | null;

  /**
   * Massimo numero di job totali per l'intero jobId.
   * Se superato, l'orchestratore riduce i prodotti meno prioritari.
   * Default: null (nessun limite hard)
   */
  readonly maxTotalJobs?: number;

  /**
   * Consenti trattamenti fuori periodo di produzione (pre-semina, post-raccolta).
   * Default: true
   */
  readonly allowOutsideProductionTreatments?: boolean;

  /**
   * Priorità categorie prodotto (ordine decrescente di importanza).
   * Es: ['fungicide', 'insecticide', 'herbicide', 'acaricide']
   * Se non specificato, usa priorità default basata su categoria etichetta.
   */
  readonly categoryPriority?: string[];

  /**
   * Avversità prioritarie da coprire (hanno precedenza nella selezione).
   * Es: ['Peronospora', 'Oidio', 'Botrite']
   */
  readonly priorityTargets?: string[];

  /**
   * Nota testuale libera per contesto agronomico aggiuntivo.
   * Es: "Pressione oidio alta quest'anno", "Evitare rame", "No trattamenti in fioritura"
   * Viene usata dall'LLM per affinare la selezione.
   */
  readonly agronomicNotes?: string;

  /**
   * Se true, abilita l'uso dell'LLM per la selezione finale (più preciso ma più lento).
   * Se false, usa solo logica deterministica (più veloce).
   * Default: false
   */
  readonly useLlmForSelection?: boolean;
}

export interface DisciplinariContext {
  readonly agronomicNotes?: string;
  readonly priorityTargets?: string[];
}

/** Macchina associata ai job per una specifica azienda */
export interface OperationMachine {
  readonly companyId: string;
  readonly machineId: string;
}

/** Operatore associato ai job per una specifica azienda */
export interface OperationOperator {
  readonly companyId: string;
  readonly userId: string;
}

export interface InputDosageAgent {
  products: FindLabelExtractionInputWithDosage[];
  unitOfProduction: Partial<
    ProductionUnit & Partial<Field> & { disciplinari: string[]; cropVariety: string }
  >[];
  strategy?: DosageStrategy;
  /**
   * Optional planning window: when provided, the agent will only schedule applications within this range.
   * Defaults to current behavior when omitted.
   */
  startAt?: Date | string;
  endAt?: Date | string;
  /**
   * Se true, scala le dosi per rispettare lo stock disponibile.
   * Se false (default), usa le dosi ottimali anche se superano lo stock (il magazzino può andare sotto stock).
   */
  outStockLimiter?: boolean;
  /**
   * Configurazione orchestratore per controllare selezione e limiti prodotti.
   * Se non specificato, usa valori default (objective: 'balanced').
   */
  orchestrator?: OrchestratorConfig;
  /**
   * Macchine da associare ai job creati, indicizzate per companyId.
   * Per ogni azienda si può specificare una macchina diversa.
   */
  operationMachines?: OperationMachine[];
  /**
   * Operatori da associare ai job creati, indicizzati per companyId.
   * Per ogni azienda si può specificare un operatore diverso.
   */
  operationOperators?: OperationOperator[];
}

export interface RunFlowsOptions {
  readonly queueJobId?: string;
  readonly userId?: string;
  readonly persist?: boolean;
  readonly companyId?: string;
  readonly jobGroupId?: string;
  readonly jobType?: LlmJobType;
}

export type RawUnitOfProduction = Partial<
  ProductionUnit &
    Partial<Field> & { disciplinari: string[]; cropVariety: string; cycleId?: string }
>;

/**
 * Prodotto escluso dalla selezione con motivazione LLM.
 * Viene usato per creare job con quantity 0 per informare l'utente
 * del motivo per cui un prodotto proposto non è stato selezionato.
 */
export interface ExcludedProduct {
  /** Indice originale del prodotto (1-based) */
  readonly index: number;
  /** Nome del prodotto */
  readonly name: string;
  /** Numero di registrazione */
  readonly regNumber: string;
  /** Motivazione specifica generata dall'LLM per l'esclusione */
  readonly exclusionReason: string;
  /** Categoria del prodotto (fungicide, insecticide, etc.) */
  readonly category: string | null;
  /** Prodotto originale con tutti i dati */
  readonly product: unknown;
}

/**
 * Risultato della selezione prodotti con prodotti esclusi.
 */
export interface ProductSelectionResult {
  /** Prodotti selezionati per il trattamento */
  readonly selected: ReadonlyArray<unknown>;
  /** Prodotti esclusi con motivazioni */
  readonly excluded: ReadonlyArray<ExcludedProduct>;
  /** Motivazione generale della selezione */
  readonly generalReason: string | null;
}
