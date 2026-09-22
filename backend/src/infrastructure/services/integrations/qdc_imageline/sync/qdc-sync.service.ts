/**
 * Orchestrates a full QDC → Seminai mirror sync run: anagrafica, then a
 * sequential deep-sync per azienda, finalizing the QdcSyncRun row with status
 * and counters. Consumed by both the nightly QdcSyncQueue worker and the
 * manual POST /qdc/sync trigger. Strictly READ-ONLY toward QDC.
 */

import type { PrismaClient } from '@prisma/client';
import { getAnalyticsService } from '../../../analytics/analytics-service.singleton';
import { getQdcApiFromClientId } from '../auth';
import type { QdcImageLineRestApi } from '../rest_api';
import { syncAziende } from './qdc-sync-anagrafica';
import { syncOneAzienda } from './qdc-sync-azienda';
import { emptyCounters } from './qdc-sync.types';
import type {
  QdcAziendaError,
  QdcSyncCounters,
  QdcSyncOptions,
  QdcSyncOutcome,
  QdcSyncStatus,
} from './qdc-sync.types';

const ERROR_SUMMARY_MAX_LENGTH = 1000;
const SYSTEM_DISTINCT_ID = 'system:qdc-sync';

export interface QdcSyncRunInput {
  readonly syncRunId: string;
  readonly trigger: 'cron' | 'manual';
  readonly clientId: string;
  readonly userId?: string;
  readonly options?: QdcSyncOptions;
}

interface QdcSyncServiceDeps {
  readonly prisma: PrismaClient;
  readonly getApi?: (clientId: string) => Promise<QdcImageLineRestApi>;
}

function addCounters(target: QdcSyncCounters, delta: QdcSyncCounters): void {
  (Object.keys(target) as (keyof QdcSyncCounters)[]).forEach((key) => {
    target[key] += delta[key];
  });
}

function buildErrorSummary(errors: readonly QdcAziendaError[]): string | null {
  if (errors.length === 0) {
    return null;
  }
  const summary = errors.map((e) => `[${e.nome} #${e.qdcId}] ${e.step}: ${e.message}`).join('; ');
  return summary.slice(0, ERROR_SUMMARY_MAX_LENGTH);
}

export class QdcSyncService {
  private readonly prisma: PrismaClient;
  private readonly getApi: (clientId: string) => Promise<QdcImageLineRestApi>;

  constructor(deps: QdcSyncServiceDeps) {
    this.prisma = deps.prisma;
    this.getApi = deps.getApi ?? getQdcApiFromClientId;
  }

  public async runSync(input: QdcSyncRunInput): Promise<QdcSyncOutcome> {
    const startedAt = new Date();
    try {
      const outcome = await this.executeSync(input, startedAt);
      await this.finalizeRun(input.syncRunId, outcome);
      this.captureAnalytics(input, outcome, startedAt);
      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[qdc-sync] run ${input.syncRunId} failed:`, error);
      const outcome: QdcSyncOutcome = {
        status: 'error',
        counters: emptyCounters(),
        aziendaErrors: [],
      };
      await this.finalizeRun(input.syncRunId, outcome, message);
      this.captureAnalytics(input, outcome, startedAt);
      return outcome;
    }
  }

  private async executeSync(input: QdcSyncRunInput, startedAt: Date): Promise<QdcSyncOutcome> {
    const api = await this.getApi(input.clientId);
    const { aziende } = await syncAziende({ api, prisma: this.prisma });
    const toDeepSync =
      input.options?.maxAziende !== undefined
        ? aziende.slice(0, input.options.maxAziende)
        : aziende;
    const counters = emptyCounters();
    counters.aziendeTotal = toDeepSync.length;
    const aziendaErrors: QdcAziendaError[] = [];
    const failedAziende = new Set<number>();
    for (const azienda of toDeepSync) {
      const result = await syncOneAzienda({
        api,
        prisma: this.prisma,
        azienda,
        runStartedAt: startedAt,
      });
      addCounters(counters, result.delta);
      if (result.errors.length > 0) {
        aziendaErrors.push(...result.errors);
        failedAziende.add(azienda.qdcId);
      }
    }
    counters.aziendeFailed = failedAziende.size;
    // 'error' is reserved for runs where nothing could be synced (getApi or
    // anagrafica failure, handled by the top-level catch): step failures on
    // some aziende still leave synced data behind → 'partial'.
    const status: QdcSyncStatus = failedAziende.size > 0 ? 'partial' : 'success';
    return { status, counters, aziendaErrors };
  }

  private async finalizeRun(
    syncRunId: string,
    outcome: QdcSyncOutcome,
    topLevelError?: string,
  ): Promise<void> {
    await this.prisma.qdcSyncRun.update({
      where: { id: syncRunId },
      data: {
        status: outcome.status,
        finishedAt: new Date(),
        counters: { ...outcome.counters },
        error: topLevelError ?? buildErrorSummary(outcome.aziendaErrors),
      },
    });
  }

  private captureAnalytics(input: QdcSyncRunInput, outcome: QdcSyncOutcome, startedAt: Date): void {
    getAnalyticsService().capture({
      distinctId: input.userId ?? SYSTEM_DISTINCT_ID,
      event: 'qdc_sync_completed',
      properties: {
        trigger: input.trigger,
        status: outcome.status,
        aziende_total: outcome.counters.aziendeTotal,
        aziende_failed: outcome.counters.aziendeFailed,
        operazioni_upserted: outcome.counters.operazioniUpserted,
        giacenze_rows: outcome.counters.giacenzeRows,
        duration_ms: Date.now() - startedAt.getTime(),
      },
    });
  }
}
