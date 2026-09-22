import {
  JobHistoryEntry,
  JobHistoryEntryMetadata,
  DosageAgentStep,
  DataSource,
} from '../../../../domain/dtos/job-history.dto';

/**
 * Collector che accumula le decisioni prese durante l'esecuzione del dosage agent
 * per una singola unità produttiva e prodotto
 */
export class JobHistoryCollector {
  private readonly entries: JobHistoryEntry[] = [];

  /**
   * Aggiunge una entry allo storico
   */
  public addEntry(
    title: string,
    value: string | number | boolean | null,
    step: DosageAgentStep | string,
    source: DataSource | string,
    metadata?: JobHistoryEntryMetadata,
  ): void {
    this.entries.push({
      title,
      value,
      step,
      source,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Restituisce tutte le entries raccolte
   */
  public getEntries(): ReadonlyArray<JobHistoryEntry> {
    return [...this.entries];
  }

  /**
   * Restituisce le entries in formato JSON serializzabile
   */
  public toJson(): unknown {
    return this.entries;
  }

  /**
   * Crea un nuovo collector copiando le entries esistenti
   */
  public clone(): JobHistoryCollector {
    const newCollector = new JobHistoryCollector();
    this.entries.forEach((entry) => {
      newCollector.addEntry(entry.title, entry.value, entry.step, entry.source);
    });
    return newCollector;
  }

  /**
   * Pulisce tutte le entries
   */
  public clear(): void {
    this.entries.length = 0;
  }

  /**
   * Restituisce il numero di entries
   */
  public size(): number {
    return this.entries.length;
  }
}

/**
 * Manager che gestisce i collector per unità produttiva + prodotto
 */
export class JobHistoryManager {
  private readonly collectors: Map<string, JobHistoryCollector> = new Map();

  /**
   * Ottiene o crea un collector per una specifica unità produttiva + prodotto
   */
  public getCollector(unitProductionId: string, productKey: string): JobHistoryCollector {
    const key = `${unitProductionId}|${productKey}`;
    if (!this.collectors.has(key)) {
      this.collectors.set(key, new JobHistoryCollector());
    }
    return this.collectors.get(key)!;
  }

  /**
   * Ottiene il collector esistente o null se non esiste
   */
  public getExistingCollector(
    unitProductionId: string,
    productKey: string,
  ): JobHistoryCollector | null {
    const key = `${unitProductionId}|${productKey}`;
    return this.collectors.get(key) ?? null;
  }

  /**
   * Aggiunge una entry a un collector specifico
   */
  public addEntry(
    unitProductionId: string,
    productKey: string,
    title: string,
    value: string | number | boolean | null,
    step: DosageAgentStep | string,
    source: DataSource | string,
    metadata?: JobHistoryEntryMetadata,
  ): void {
    const collector = this.getCollector(unitProductionId, productKey);
    collector.addEntry(title, value, step, source, metadata);
  }

  /**
   * Ottiene tutte le entries per una specifica unità produttiva + prodotto
   */
  public getEntries(unitProductionId: string, productKey: string): ReadonlyArray<JobHistoryEntry> {
    const collector = this.getExistingCollector(unitProductionId, productKey);
    return collector?.getEntries() ?? [];
  }

  /**
   * Ottiene tutte le chiavi registrate
   */
  public getAllKeys(): ReadonlyArray<string> {
    return Array.from(this.collectors.keys());
  }

  /**
   * Pulisce tutti i collector
   */
  public clear(): void {
    this.collectors.clear();
  }
}
