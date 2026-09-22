import { createHash } from 'crypto';

export interface ToolCallRecord {
  readonly name: string;
  readonly argsHash: string;
  readonly argsPreview: string;
}

export interface ToolCallLike {
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}

export function createToolCallRecord(toolCall: ToolCallLike | undefined): ToolCallRecord {
  const name = toolCall?.name ?? 'unknown';
  const argsJson = stableStringify(toolCall?.args ?? {});
  return {
    name,
    argsHash: createHash('sha256').update(argsJson).digest('hex').slice(0, 16),
    argsPreview: argsJson.slice(0, 500),
  };
}

export function normalizeToolCallHistory(
  history: ReadonlyArray<string | ToolCallRecord>,
): ToolCallRecord[] {
  return history.map((item) =>
    typeof item === 'string' ? { name: item, argsHash: 'legacy', argsPreview: '{}' } : item,
  );
}

export function getToolCallFingerprint(record: ToolCallRecord): string {
  return `${record.name}:${record.argsHash}`;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  }
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}
