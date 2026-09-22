import { prisma } from '../../../repositories/Prisma';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { NormalizedUnit, extractProvinceCode } from './flowMatchDosageDisciplinari.part-01-usage-logger';
import { buildAddressString, extractFromSnapshot, extractProvinceFromSnapshot } from './flowMatchDosageDisciplinari.part-03-select-dose-limit';
import { ProductionUnitWithFields } from './flowMatchDosageDisciplinari.part-04-region-lookup-service';

export async function resolveUnitAddress(
  unitProductionId: string,
  normalizedUnit: NormalizedUnit | undefined,
): Promise<string | undefined> {
  const snapshotAddress = buildAddressString([
    extractFromSnapshot(normalizedUnit, 'address'),
    extractFromSnapshot(normalizedUnit, 'city'),
    extractProvinceFromSnapshot(normalizedUnit),
    extractFromSnapshot(normalizedUnit, 'cap'),
    extractFromSnapshot(normalizedUnit, 'nation') ?? 'Italia',
  ]);
  if (snapshotAddress) {
    return snapshotAddress;
  }
  try {
    const unitRecord: ProductionUnitWithFields | null = await prisma.productionUnit.findUnique({
      where: { id: unitProductionId },
      include: {
        productionUnitsOnFields: {
          include: {
            field: {
              select: {
                address: true,
                city: true,
                cap: true,
                nation: true,
                company: {
                  select: {
                    address: true,
                    city: true,
                    cap: true,
                    nation: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const relation = unitRecord?.productionUnitsOnFields?.[0];
    const field = relation?.field;
    const fieldAddress = buildAddressString([
      field?.address ?? undefined,
      field?.city ?? undefined,
      extractProvinceCode(field?.city),
      field?.cap ?? undefined,
      field?.nation ?? 'Italia',
    ]);
    if (fieldAddress) {
      return fieldAddress;
    }
    const company = field?.company;
    const companyAddress = buildAddressString([
      company?.address ?? undefined,
      company?.city ?? undefined,
      extractProvinceCode(company?.city),
      company?.cap ?? undefined,
      company?.nation ?? 'Italia',
    ]);
    return companyAddress;
  } catch (error) {
    console.warn(
      `[DISCIPLINARI] Errore nel recupero indirizzo per unità ${unitProductionId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

export function appendHistoryNote(
  historyManager: JobHistoryManager | undefined,
  unitId: string,
  productKey: string,
  title: string,
  value: string,
  metadata: Parameters<JobHistoryManager['addEntry']>[6],
): void {
  if (!historyManager) {
    return;
  }
  historyManager.addEntry(
    unitId,
    productKey,
    title,
    value,
    DosageAgentStep.DISCIPLINARI_VALIDATION,
    DataSource.BDF_DATABASE,
    metadata,
  );
}

export function buildHistoryMetadata(
  unit: UnitAllowedProductsWithDosageOutput,
  product: UnitAllowedProductsWithDosageOutput['products'][number],
): Parameters<JobHistoryManager['addEntry']>[6] {
  return {
    productionUnitId: unit.unitProductionId,
    cropName: unit.cropName,
    variety: unit.variety,
    areaHa: unit.areaHa,
    productName: String((product as { name?: string }).name || ''),
    productRegistrationNumber: String((product as { regNumber?: string }).regNumber || ''),
  };
}

export type ReadonlyTreatment = NonNullable<
  UnitAllowedProductsWithDosageOutput['products'][number]['trattamenti']
>[number];

export type MutableTreatment = {
  data_distribuzione?: Date;
  dose?: number;
  epoca_impiego?: string;
  isLocalizedTreatment?: boolean;
  note?: string;
  dosaggio_um?: string;
};

export function cloneTreatments(
  trattamenti: ReadonlyArray<ReadonlyTreatment> | undefined,
): MutableTreatment[] {
  if (!trattamenti) return [];
  return trattamenti.map((treatment) => ({ ...treatment }));
}

export function annotateTreatmentNote(treatment: MutableTreatment, message: string): void {
  if (!message) return;
  const separator = treatment.note ? ' ' : '';
  treatment.note = `${treatment.note ?? ''}${separator}${message}`.trim();
}
