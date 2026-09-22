import { Field } from '../../../domain/entities/Field';
import { BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';

type FieldAllocation = BulkImportDTO['productionUnits'][number]['fieldAllocations'][number];

export interface FieldAllocationLookup {
  readonly resolve: (allocation: FieldAllocation) => FieldAllocationResolution;
}

export type FieldAllocationResolution =
  | { readonly status: 'found'; readonly fieldId: string }
  | { readonly status: 'missing' }
  | { readonly status: 'ambiguous' };

export function buildFieldAllocationLookup(
  fields: readonly Field[],
  companyId: string | null,
): FieldAllocationLookup {
  const byId = new Set<string>();
  const exact = new Map<string, string>();
  const cadastral = new Map<string, Set<string>>();
  const cadastralWithComune = new Map<string, Set<string>>();
  for (const field of fields) {
    byId.add(field.id);
    exact.set(buildExactFieldKey(field.name, field, field.companyId ?? ''), field.id);
    exact.set(buildExactFieldKey(field.name, field, ''), field.id);
    if (field.foglio && field.particella) {
      const key = buildCadastralKey(
        field.sezione,
        field.foglio,
        field.particella,
        field.subalterno,
      );
      const ids = cadastral.get(key) ?? new Set<string>();
      ids.add(field.id);
      cadastral.set(key, ids);
      if (field.city) {
        const cityKey = buildCadastralComuneKey(
          field.city,
          field.sezione,
          field.foglio,
          field.particella,
          field.subalterno,
        );
        const cityIds = cadastralWithComune.get(cityKey) ?? new Set<string>();
        cityIds.add(field.id);
        cadastralWithComune.set(cityKey, cityIds);
      }
    }
  }
  return {
    resolve: (allocation) =>
      resolveAllocation(allocation, byId, exact, cadastral, cadastralWithComune, companyId),
  };
}

function resolveAllocation(
  allocation: FieldAllocation,
  byId: ReadonlySet<string>,
  exact: ReadonlyMap<string, string>,
  cadastral: ReadonlyMap<string, ReadonlySet<string>>,
  cadastralWithComune: ReadonlyMap<string, ReadonlySet<string>>,
  companyId: string | null,
): FieldAllocationResolution {
  if (allocation.fieldId && byId.has(allocation.fieldId)) {
    return { status: 'found', fieldId: allocation.fieldId };
  }
  if (!allocation.foglio || !allocation.particella) return { status: 'missing' };
  const comune = allocation.comune ?? allocation.codiceNazionale;
  if (comune) {
    const detailed = resolveCandidates(
      cadastralWithComune.get(
        buildCadastralComuneKey(
          comune,
          allocation.sezione,
          allocation.foglio,
          allocation.particella,
          allocation.subalterno,
        ),
      ),
    );
    if (detailed.status !== 'missing') return detailed;
  }
  const cadastralResolution = resolveCandidates(
    cadastral.get(
      buildCadastralKey(
        allocation.sezione,
        allocation.foglio,
        allocation.particella,
        allocation.subalterno,
      ),
    ),
  );
  if (cadastralResolution.status !== 'missing') return cadastralResolution;
  const exactWithCompany = exact.get(buildExactAllocationKey(allocation, companyId ?? ''));
  if (exactWithCompany) return { status: 'found', fieldId: exactWithCompany };
  const exactWithoutCompany = exact.get(buildExactAllocationKey(allocation, ''));
  if (exactWithoutCompany) return { status: 'found', fieldId: exactWithoutCompany };
  return { status: 'missing' };
}

function buildExactFieldKey(fieldName: string, field: Field, companyId: string): string {
  return [
    normalizeKeyPart(fieldName),
    normalizeKeyPart(field.sezione),
    normalizeCadastralPart(field.foglio),
    normalizeCadastralPart(field.particella),
    normalizeKeyPart(field.subalterno),
    normalizeKeyPart(companyId),
  ].join('|');
}

function buildExactAllocationKey(allocation: FieldAllocation, companyId: string): string {
  return [
    normalizeKeyPart(allocation.fieldName),
    normalizeKeyPart(allocation.sezione),
    normalizeCadastralPart(allocation.foglio),
    normalizeCadastralPart(allocation.particella),
    normalizeKeyPart(allocation.subalterno),
    normalizeKeyPart(companyId),
  ].join('|');
}

function buildCadastralComuneKey(
  comune: string,
  sezione: string | null | undefined,
  foglio: string,
  particella: string,
  subalterno: string | null | undefined,
): string {
  return `${normalizeKeyPart(comune)}|${buildCadastralKey(sezione, foglio, particella, subalterno)}`;
}

function buildCadastralKey(
  sezione: string | null | undefined,
  foglio: string,
  particella: string,
  subalterno: string | null | undefined,
): string {
  return [
    normalizeKeyPart(sezione),
    normalizeCadastralPart(foglio),
    normalizeCadastralPart(particella),
    normalizeKeyPart(subalterno),
  ].join('|');
}

function resolveCandidates(candidates: ReadonlySet<string> | undefined): FieldAllocationResolution {
  if (!candidates || candidates.size === 0) return { status: 'missing' };
  if (candidates.size > 1) return { status: 'ambiguous' };
  return { status: 'found', fieldId: [...candidates][0] };
}

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeCadastralPart(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const withoutLeadingZeroes = trimmed.replace(/^0+/, '');
  return withoutLeadingZeroes.length > 0 ? withoutLeadingZeroes : trimmed;
}
