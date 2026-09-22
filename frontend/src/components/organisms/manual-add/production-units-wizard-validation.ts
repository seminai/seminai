import {
  hasDuplicateFieldIds,
  hasUnresolvedFieldIds,
} from '@/components/organisms/manual-add/production-units-wizard-allocation-utils';
import type {
  DateRange,
  ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';

export interface SubmitValidationError {
  readonly message: string;
  readonly description?: string;
}

export function getSearchValidationError(companyId: string, dateRange: DateRange): string | null {
  if (!companyId) return "Seleziona l'azienda";
  if (!dateRange.start || !dateRange.end) return 'Imposta il periodo';
  if (new Date(dateRange.start) > new Date(dateRange.end)) {
    return 'La data di inizio deve precedere la fine';
  }
  return null;
}

export function getSubmitValidationError(
  validUnits: readonly ProductionUnitDraft[],
): SubmitValidationError | null {
  if (validUnits.length === 0) {
    return { message: "Aggiungi almeno un'unità con allocazioni" };
  }
  if (validUnits.some((unit) => hasUnresolvedFieldIds(unit.allocations))) {
    return {
      message: 'Assegna tutti i campi prima di confermare',
      description:
        'Crea i campi dallo shapefile in archivio oppure collega ogni allocazione a un campo esistente.',
    };
  }
  if (validUnits.some((unit) => hasDuplicateFieldIds(unit.allocations))) {
    return {
      message: 'Due allocazioni puntano allo stesso campo',
      description: 'Rimuovi o modifica le allocazioni duplicate nella stessa unità produttiva.',
    };
  }
  return null;
}
