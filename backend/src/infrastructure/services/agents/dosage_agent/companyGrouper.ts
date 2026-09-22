import { prisma } from '../../../repositories/Prisma';
import type { RawUnitOfProduction } from './types';

/**
 * Raggruppa le unità produttive per azienda
 */
export async function groupUnitsByCompany(
  units: RawUnitOfProduction[],
): Promise<Map<string, { units: RawUnitOfProduction[]; companyName: string }>> {
  const companyMap = new Map<string, { units: RawUnitOfProduction[]; companyName: string }>();

  // Raccogli tutti gli ID delle unità
  const unitIds: string[] = [];
  const unitIdToUnit = new Map<string, RawUnitOfProduction>();

  for (const unit of units) {
    const rawId =
      (unit as { id?: string; idApp?: string }).id ??
      (unit as { idApp?: string }).idApp ??
      undefined;
    const unitId = typeof rawId === 'string' ? rawId.trim() : '';
    if (unitId) {
      unitIds.push(unitId);
      unitIdToUnit.set(unitId, unit);
    }
  }

  if (unitIds.length === 0) {
    // Nessuna unità con ID, raggruppa tutto in un'unica categoria
    const noCompanyKey = '__NO_COMPANY__';
    companyMap.set(noCompanyKey, { units, companyName: 'Azienda Sconosciuta' });
    return companyMap;
  }

  // Query batch per ottenere le informazioni sulle aziende
  const unitRecords = await prisma.productionUnit.findMany({
    where: { id: { in: unitIds } },
    include: {
      productionUnitsOnFields: {
        include: {
          field: {
            select: {
              companyId: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Raggruppa per azienda
  for (const unitRecord of unitRecords) {
    const unit = unitIdToUnit.get(unitRecord.id);
    if (!unit) {
      continue;
    }

    const firstRelation = unitRecord.productionUnitsOnFields.find(
      (relation) => relation.field?.companyId,
    );
    const companyId = firstRelation?.field?.companyId ?? null;
    const companyName = firstRelation?.field?.company?.name ?? 'Azienda Sconosciuta';

    if (!companyId) {
      const noCompanyKey = '__NO_COMPANY__';
      const existing = companyMap.get(noCompanyKey);
      if (existing) {
        existing.units.push(unit);
      } else {
        companyMap.set(noCompanyKey, { units: [unit], companyName: 'Azienda Sconosciuta' });
      }
      continue;
    }

    const existing = companyMap.get(companyId);
    if (existing) {
      existing.units.push(unit);
    } else {
      companyMap.set(companyId, { units: [unit], companyName });
    }
  }

  // Aggiungi unità senza record nel database
  for (const unit of units) {
    const rawId =
      (unit as { id?: string; idApp?: string }).id ??
      (unit as { idApp?: string }).idApp ??
      undefined;
    const unitId = typeof rawId === 'string' ? rawId.trim() : '';
    if (!unitId || !unitIds.includes(unitId)) {
      const noCompanyKey = '__NO_COMPANY__';
      const existing = companyMap.get(noCompanyKey);
      if (existing) {
        existing.units.push(unit);
      } else {
        companyMap.set(noCompanyKey, { units: [unit], companyName: 'Azienda Sconosciuta' });
      }
    }
  }

  return companyMap;
}
