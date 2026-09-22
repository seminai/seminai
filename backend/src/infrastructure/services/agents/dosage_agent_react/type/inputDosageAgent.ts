import { Field, ProductionUnit } from '@prisma/client';
import { FindLabelExtractionInputWithDosage, OrchestratorConfig } from '../../dosage_agent/types';
import { DosageStrategy } from '../../dosage_agent';

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
}
