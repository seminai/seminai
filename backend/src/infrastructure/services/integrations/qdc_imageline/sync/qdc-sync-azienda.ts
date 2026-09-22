/**
 * Deep-sync of a single QDC azienda: production units, field operations
 * (incremental window), deleted operations, warehouse snapshots and deadlines.
 * Every remote call is retried and throttled; step failures are collected so
 * one azienda (or one step) cannot abort the whole run.
 */

import type { Prisma, PrismaClient, QdcAzienda } from '@prisma/client';
import { parseTableToRecords } from '../operazioni-parsers';
import type { QdcImageLineRestApi } from '../rest_api';
import { getTodayIT, withRetry } from '../utils';
import type { QdcRecord } from '../operazioni-parsers';
import { QDC_OPERATION_TYPES, emptyCounters } from './qdc-sync.types';
import type { QdcAziendaError, QdcSyncCounters } from './qdc-sync.types';
import {
  computeSyncWindow,
  delay,
  toJson,
  toNullableDate,
  toNullableNumber,
  toNullableString,
  toRecordId,
} from './qdc-sync-utils';

const INTER_CALL_DELAY_MS = 150;

const ELIMINATE_TIPO_HINTS: readonly (readonly [string, string])[] = [
  ['trattament', 'trattamenti'],
  ['fertilizzazion', 'fertilizzazioni'],
  ['irrigazion', 'irrigazioni'],
  ['raccolt', 'raccolte'],
  ['semin', 'semine'],
  ['trapiant', 'trapianti'],
  ['sovesc', 'sovesci'],
  ['ispezion', 'ispezioni_campo'],
  ['ausiliar', 'lanci_ausiliari'],
  ['conc', 'conce_sementi'],
  ['smaltiment', 'smaltimenti_rifiuti'],
  ['altre', 'altre_operazioni'],
] as const;

interface SyncOneAziendaDeps {
  readonly api: QdcImageLineRestApi;
  readonly prisma: PrismaClient;
  readonly azienda: QdcAzienda;
  readonly runStartedAt: Date;
}

export interface AziendaSyncResult {
  readonly errors: readonly QdcAziendaError[];
  readonly delta: QdcSyncCounters;
}

interface StepContext extends SyncOneAziendaDeps {
  readonly window: { dataDa: string; dataA: string };
  readonly delta: QdcSyncCounters;
}

async function syncUnita(ctx: StepContext): Promise<void> {
  const response = await withRetry(() =>
    ctx.api.colture.getUnita({ idAzienda: ctx.azienda.qdcId, anno: new Date().getFullYear() }),
  );
  for (const record of parseTableToRecords(response.result)) {
    const qdcId = toRecordId(record.ID_UNITA);
    if (qdcId === null) {
      ctx.delta.skippedNoId += 1;
      continue;
    }
    const anno = toRecordId(record.ANNOINIZIO) ?? new Date().getFullYear();
    const fields = {
      coltura: toNullableString(record.COLTURA),
      varieta: toNullableString(record.VARIETA),
      superficie: toNullableNumber(record.SUPERFICIE),
      lat: toNullableNumber(record.LAT),
      lon: toNullableNumber(record.LON),
      raw: toJson(record),
    };
    await ctx.prisma.qdcUnita.upsert({
      where: { qdcAziendaId_anno_qdcId: { qdcAziendaId: ctx.azienda.id, anno, qdcId } },
      create: { qdcAziendaId: ctx.azienda.id, anno, qdcId, ...fields },
      update: fields,
    });
    ctx.delta.unitaUpserted += 1;
  }
}

async function syncOperazioniTipo(
  ctx: StepContext,
  tipo: string,
  records: QdcRecord[],
): Promise<void> {
  for (const record of records) {
    const qdcId = toRecordId(record.ID);
    if (qdcId === null) {
      ctx.delta.skippedNoId += 1;
      continue;
    }
    const fields = {
      dataOperazione: toNullableDate(record.DATA),
      raw: toJson(record),
    };
    await ctx.prisma.qdcOperazione.upsert({
      where: { qdcAziendaId_tipo_qdcId: { qdcAziendaId: ctx.azienda.id, tipo, qdcId } },
      create: { qdcAziendaId: ctx.azienda.id, tipo, qdcId, ...fields },
      update: fields,
    });
    ctx.delta.operazioniUpserted += 1;
  }
}

async function syncOperazioni(ctx: StepContext): Promise<void> {
  const params = {
    idAzienda: ctx.azienda.qdcId,
    dataPeriodoDa: ctx.window.dataDa,
    dataPeriodoA: ctx.window.dataA,
  };
  for (const fetcher of QDC_OPERATION_TYPES) {
    const response = await withRetry(() => fetcher.fetch(ctx.api, params));
    await syncOperazioniTipo(ctx, fetcher.tipo, parseTableToRecords(response.result));
    await delay(INTER_CALL_DELAY_MS);
  }
}

function mapEliminataTipo(record: QdcRecord): string | null {
  const candidates = [record.TIPO, record.TIPO_OPERAZIONE, record.OPERAZIONE, record.DESCRIZIONE];
  for (const candidate of candidates) {
    const text = toNullableString(candidate)?.toLowerCase();
    if (!text) continue;
    const hint = ELIMINATE_TIPO_HINTS.find(([needle]) => text.includes(needle));
    if (hint) return hint[1];
  }
  return null;
}

/** Deleted-op removal is best-effort: a miss only leaves stale mirror rows. */
async function syncOperazioniEliminate(ctx: StepContext): Promise<void> {
  try {
    const response = await withRetry(() =>
      ctx.api.operazioniRegistro.getOperazioniEliminate({
        idAzienda: ctx.azienda.qdcId,
        dataPeriodoDa: ctx.window.dataDa,
        dataPeriodoA: ctx.window.dataA,
      }),
    );
    const result = response.result;
    const columns = result?.COLUMNS ?? result?.columns;
    console.log('[qdc-sync] getoperazionieliminate COLUMNS:', JSON.stringify(columns ?? null));
    for (const record of parseTableToRecords(result)) {
      const qdcId = toRecordId(record.ID) ?? toRecordId(record.ID_OPERAZIONE);
      const tipo = mapEliminataTipo(record);
      if (qdcId === null || !tipo) {
        console.warn(
          '[qdc-sync] operazione eliminata non mappabile, ignorata:',
          JSON.stringify(record),
        );
        continue;
      }
      const deleted = await ctx.prisma.qdcOperazione.deleteMany({
        where: { qdcAziendaId: ctx.azienda.id, tipo, qdcId },
      });
      ctx.delta.operazioniDeleted += deleted.count;
    }
  } catch (error) {
    console.warn(
      `[qdc-sync] getoperazionieliminate fallita per azienda ${ctx.azienda.qdcId}:`,
      error,
    );
  }
}

async function syncGiacenze(ctx: StepContext): Promise<void> {
  const categorie = [
    {
      categoria: 'agrofarmaci',
      fetch: () =>
        ctx.api.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci({
          idAzienda: ctx.azienda.qdcId,
          data: getTodayIT(),
        }),
    },
    {
      categoria: 'fertilizzanti',
      fetch: () =>
        ctx.api.magazzinoFertilizzanti.getGiacenzeFertilizzanti({
          idAzienda: ctx.azienda.qdcId,
          data: getTodayIT(),
        }),
    },
  ] as const;
  for (const { categoria, fetch } of categorie) {
    const response = await withRetry(fetch);
    const rows = parseTableToRecords(response.result).map((record) => ({
      qdcAziendaId: ctx.azienda.id,
      categoria,
      prodotto: toNullableString(record.PRODOTTO) ?? '',
      qta: toNullableNumber(record.QTA),
      udm: toNullableString(record.UDM),
      raw: toJson(record),
      snapshotAt: ctx.runStartedAt,
    }));
    await ctx.prisma.$transaction([
      ctx.prisma.qdcGiacenza.deleteMany({ where: { qdcAziendaId: ctx.azienda.id, categoria } }),
      ctx.prisma.qdcGiacenza.createMany({ data: rows }),
    ]);
    ctx.delta.giacenzeRows += rows.length;
    await delay(INTER_CALL_DELAY_MS);
  }
}

async function syncScadenze(ctx: StepContext): Promise<void> {
  const result = await withRetry(() => ctx.api.licenza.getScadenze(ctx.azienda.qdcId));
  const rows = [
    ...(result.patentini ?? []).map((raw) => ({ tipo: 'patentino', raw })),
    ...(result.tarature ?? []).map((raw) => ({ tipo: 'taratura', raw })),
  ].map((row) => ({
    qdcAziendaId: ctx.azienda.id,
    tipo: row.tipo,
    raw: row.raw as unknown as Prisma.InputJsonValue,
    syncedAt: ctx.runStartedAt,
  }));
  await ctx.prisma.$transaction([
    ctx.prisma.qdcScadenza.deleteMany({ where: { qdcAziendaId: ctx.azienda.id } }),
    ctx.prisma.qdcScadenza.createMany({ data: rows }),
  ]);
  ctx.delta.scadenzeRows += rows.length;
}

export async function syncOneAzienda(deps: SyncOneAziendaDeps): Promise<AziendaSyncResult> {
  const ctx: StepContext = {
    ...deps,
    window: computeSyncWindow(deps.azienda.lastSyncedAt),
    delta: emptyCounters(),
  };
  const errors: QdcAziendaError[] = [];
  const runStep = async (step: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[qdc-sync] step "${step}" fallito per azienda ${deps.azienda.qdcId}: ${message}`,
      );
      errors.push({ qdcId: deps.azienda.qdcId, nome: deps.azienda.nome, step, message });
    }
  };
  await runStep('unita', () => syncUnita(ctx));
  await runStep('operazioni', () => syncOperazioni(ctx));
  await syncOperazioniEliminate(ctx);
  await runStep('giacenze', () => syncGiacenze(ctx));
  await runStep('scadenze', () => syncScadenze(ctx));
  if (errors.length === 0) {
    await deps.prisma.qdcAzienda.update({
      where: { id: deps.azienda.id },
      data: { lastSyncedAt: deps.runStartedAt },
    });
  }
  return { errors, delta: ctx.delta };
}
