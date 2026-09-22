import {
  type FileExtractionEditLogRecord,
  type IFileExtractionEditLogRepository,
} from '../../../domain/repositories/IFileExtractionEditLogRepository';
import { type LogFileExtractionEditInput } from '../../../domain/dtos/file-extraction-edit-log.dto';

/**
 * Appends a before/after edit log row for a FileExtraction.
 * Skips no-op USER_EDIT / CONFIRM_OVERRIDE saves where before === after by deep value.
 * LLM_INITIAL is always written (before is conceptually null).
 */
export class LogFileExtractionEditUseCase {
  constructor(private readonly repository: IFileExtractionEditLogRepository) {}

  async execute(input: LogFileExtractionEditInput): Promise<FileExtractionEditLogRecord | null> {
    if (input.source !== 'LLM_INITIAL' && deepEqualJson(input.before, input.after)) {
      return null;
    }
    return this.repository.append({
      extractionId: input.extractionId,
      source: input.source,
      beforeData: input.source === 'LLM_INITIAL' ? null : input.before,
      afterData: input.after,
      userId: input.userId,
    });
  }
}

function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  try {
    // Key-order-insensitive: persisted JSON (jsonb) and re-validated payloads may
    // differ only in key order, which must still count as a no-op.
    return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
  } catch {
    return false;
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}
