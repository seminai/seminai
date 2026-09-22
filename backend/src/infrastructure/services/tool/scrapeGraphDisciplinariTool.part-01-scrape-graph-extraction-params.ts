import { DisciplinariExtractionCategory } from '../integrations/scrapegraph';
import type { DisciplinariExtractedData } from '../../../domain/dtos/disciplinari.dto';

// ============================================================
// Types and Interfaces
// ============================================================

export interface ScrapeGraphExtractionParams {
  readonly url: string;
  readonly region?: string;
  readonly year?: number;
  readonly category?: DisciplinariExtractionCategory;
  readonly saveToDatabase?: boolean;
  readonly userId?: string;
}

export interface ScrapeGraphExtractionResult {
  readonly success: boolean;
  readonly category: DisciplinariExtractionCategory;
  readonly data: Partial<DisciplinariExtractedData>;
  readonly confidence: number;
  readonly sourceUrl: string;
  readonly databaseId?: string;
  readonly error?: string;
}

// ============================================================
// Prompt Templates by Category
// ============================================================

export const EXTRACTION_PROMPTS: Record<DisciplinariExtractionCategory, string> = {
  metadata: `
Estrai i metadati del disciplinare di produzione integrata da questa pagina web.
Cerca le seguenti informazioni:
- Regione (es: Emilia-Romagna, Piemonte, Lombardia)
- Anno di riferimento (es: 2025, 2024)
- Versione o revisione (es: Rev. 1, Versione 2.0)
- Titolo completo del documento
- Data di inizio validità (formato: YYYY-MM-DD)
- Data di fine validità/scadenza (formato: YYYY-MM-DD)
- Se il documento è scaduto rispetto alla data odierna

Restituisci i dati in formato JSON strutturato.
`,

  rules: `
Estrai le regole generali del disciplinare di produzione integrata da questa pagina web.
Cerca le seguenti informazioni:
- Principi generali (priorità dei mezzi agronomici, IPM, etc.)
- Divieti espliciti (prodotti vietati, pratiche proibite)
- Azioni obbligatorie (monitoraggi, registrazioni, certificazioni)
- Definizioni e glossario dei termini tecnici

Restituisci i dati in formato JSON strutturato.
`,

  defense_targets: `
Estrai le informazioni sui target di difesa (avversità) dal disciplinare.
Per ogni avversità trova:
- Nome dell'avversità (parassita, malattia fungina, infestante)
- Tipo (insetto, fungo, infestante, altro)
- Misure di monitoraggio consigliate
- Misure agronomiche preventive
- Misure biologiche alternative
- Interventi chimici ammessi con:
  - Nome prodotto o principio attivo
  - Dose minima e massima con unità di misura
  - Numero massimo applicazioni e ambito (anno/ciclo)
  - Intervallo minimo tra trattamenti
  - Stadio fenologico ammesso
  - Vincoli e limitazioni

Restituisci i dati in formato JSON strutturato.
`,

  interventions: `
Estrai TUTTI gli interventi fitosanitari ammessi dal disciplinare.
Per ogni intervento trova:
- Nome commerciale o principio attivo
- Formulazione (se indicata)
- Dose minima e massima con unità (kg/ha, L/ha, g/hl, %)
- Numero massimo interventi per anno/ciclo
- Intervallo minimo giorni tra trattamenti
- Tempo di carenza (PHI) in giorni
- Finestra fenologica di applicazione
- Vincoli ambientali (fasce di rispetto, deriva)
- Note sulla gestione delle resistenze

Restituisci i dati in formato JSON strutturato.
`,

  scope_entities: `
Estrai le colture e le sezioni del disciplinare.
Per ogni voce trova:
- Nome della coltura (es: Vite, Melo, Pero, Pomodoro)
- Gruppo/famiglia (es: Fruttiferi, Orticole, Vitivinicole)
- Sezione del disciplinare (es: Difesa, Diserbo, Fertilizzazione)
- Sottosezione (es: Malattie fungine, Insetti, etc.)

Restituisci i dati in formato JSON strutturato.
`,
};
