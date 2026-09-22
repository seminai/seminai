import { Job } from '../entities/Job';
import { JobFieldChange, JobModificationEntry, JobHistoryItem } from './job-history.dto';

/**
 * Input DTO per tracciare chi sta effettuando la modifica
 */
export interface ModifyingUserInfo {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

/**
 * Campi del job da escludere dal confronto delle modifiche
 * (campi di sistema che non devono essere tracciati come modifiche utente)
 */
const EXCLUDED_FIELDS_FROM_COMPARISON = [
  'id',
  'createdAt',
  'updatedAt',
  'history',
  'conformityChecked', // Campo di stato gestito dal sistema (conformity checker agent)
];

/**
 * Calcola le differenze tra il vecchio job e i nuovi dati
 */
export function calculateJobChanges(existingJob: Job, newData: Partial<Job>): JobFieldChange[] {
  const changes: JobFieldChange[] = [];

  for (const [key, newValue] of Object.entries(newData)) {
    if (EXCLUDED_FIELDS_FROM_COMPARISON.includes(key)) {
      continue;
    }

    const oldValue = existingJob[key as keyof Job];

    if (!isEqual(oldValue, newValue)) {
      changes.push({
        field: key,
        oldValue: serializeValue(oldValue),
        newValue: serializeValue(newValue),
      });
    }
  }

  return changes;
}

/**
 * Crea uno snapshot del job esistente per il backup
 */
export function createJobSnapshot(job: Job): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(job)) {
    if (!EXCLUDED_FIELDS_FROM_COMPARISON.includes(key)) {
      snapshot[key] = serializeValue(value);
    }
  }

  return snapshot;
}

/**
 * Crea una entry di modifica per la history
 */
export function createModificationEntry(
  modifiedBy: ModifyingUserInfo,
  changes: JobFieldChange[],
  previousJobSnapshot: Record<string, unknown>,
  reason?: string,
): JobModificationEntry {
  return {
    type: 'modification',
    timestamp: new Date().toISOString(),
    modifiedBy: {
      userId: modifiedBy.userId,
      name: modifiedBy.name,
      email: modifiedBy.email,
    },
    changes,
    previousJobSnapshot,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Unisce la nuova entry di modifica con la history esistente
 */
export function mergeHistoryWithModification(
  existingHistory: unknown,
  modificationEntry: JobModificationEntry,
): JobHistoryItem[] {
  const history: JobHistoryItem[] = Array.isArray(existingHistory)
    ? (existingHistory as JobHistoryItem[])
    : [];

  return [...history, modificationEntry];
}

/**
 * Confronta due valori per determinare se sono uguali
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}

/**
 * Serializza un valore per il salvataggio nella history
 */
function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
