/**
 * Anagrafica step of the QDC sync: upserts every license company into
 * QdcAzienda and links it to the Seminai Company by normalized VAT
 * (fallback: fiscal code). Unmatched aziende keep companyId = null.
 */

import type { PrismaClient, QdcAzienda } from '@prisma/client';
import { normalizeVat } from '../../../../../domain/utils/vat';
import { parseTableToRecords } from '../operazioni-parsers';
import type { QdcImageLineRestApi } from '../rest_api';
import { withRetry } from '../utils';
import { toJson, toNullableDate, toNullableString, toRecordId } from './qdc-sync-utils';

interface SyncAziendeDeps {
  readonly api: QdcImageLineRestApi;
  readonly prisma: PrismaClient;
}

interface SyncAziendeResult {
  readonly aziende: readonly QdcAzienda[];
  readonly unmatchedCount: number;
}

interface CompanyMatchMaps {
  readonly byVat: ReadonlyMap<string, string>;
  readonly byCf: ReadonlyMap<string, string>;
}

async function buildCompanyMatchMaps(prisma: PrismaClient): Promise<CompanyMatchMaps> {
  const companies = await prisma.company.findMany({
    select: { id: true, vatNumber: true, fiscalCode: true },
  });
  const byVat = new Map<string, string>();
  const byCf = new Map<string, string>();
  const ambiguousVat = new Set<string>();
  const ambiguousCf = new Set<string>();
  for (const company of companies) {
    const vat = normalizeVat(company.vatNumber);
    if (vat) {
      if (byVat.has(vat)) ambiguousVat.add(vat);
      else byVat.set(vat, company.id);
    }
    const cf = normalizeVat(company.fiscalCode);
    if (cf) {
      if (byCf.has(cf)) ambiguousCf.add(cf);
      else byCf.set(cf, company.id);
    }
  }
  ambiguousVat.forEach((vat) => byVat.delete(vat));
  ambiguousCf.forEach((cf) => byCf.delete(cf));
  return { byVat, byCf };
}

function resolveCompanyId(
  maps: CompanyMatchMaps,
  piva: string | null,
  cf: string | null,
): string | null {
  const byVat = piva ? maps.byVat.get(piva) : undefined;
  if (byVat) {
    return byVat;
  }
  const normalizedCf = normalizeVat(cf);
  return (normalizedCf ? maps.byCf.get(normalizedCf) : undefined) ?? null;
}

export async function syncAziende(deps: SyncAziendeDeps): Promise<SyncAziendeResult> {
  const response = await withRetry(() => deps.api.licenza.getLicenzaAziende());
  const records = parseTableToRecords(response.result);
  const maps = await buildCompanyMatchMaps(deps.prisma);
  const aziende: QdcAzienda[] = [];
  let unmatchedCount = 0;
  for (const record of records) {
    const qdcId = toRecordId(record.ID);
    if (qdcId === null) {
      console.warn('[qdc-sync] azienda senza colonna ID, riga ignorata');
      continue;
    }
    const piva = normalizeVat(toNullableString(record.PIVA));
    const cf = toNullableString(record.CF);
    const companyId = resolveCompanyId(maps, piva, cf);
    if (!companyId) {
      unmatchedCount += 1;
    }
    const fields = {
      nome: toNullableString(record.AZIENDA) ?? '',
      piva,
      cf,
      validaDa: toNullableDate(record.VALIDADA),
      validaA: toNullableDate(record.VALIDAA),
      companyId,
      raw: toJson(record),
    };
    const azienda = await deps.prisma.qdcAzienda.upsert({
      where: { qdcId },
      create: { qdcId, ...fields },
      update: fields,
    });
    aziende.push(azienda);
  }
  if (unmatchedCount > 0) {
    console.warn(
      `[qdc-sync] ${unmatchedCount}/${aziende.length} aziende QDC senza match P.IVA/CF in Seminai`,
    );
  }
  return { aziende, unmatchedCount };
}
