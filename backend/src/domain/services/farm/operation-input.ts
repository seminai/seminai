import { AppError } from '../../errors/AppError';

export interface FarmMovement {
  readonly productId: string;
  readonly type: 'IN' | 'OUT';
  readonly quantity: number;
  readonly unit: string;
  readonly price: number;
  readonly documentReference?: string;
}
export interface FarmOperationInput {
  readonly companyId: string;
  readonly date: string;
  readonly reason: string;
  readonly movements: readonly FarmMovement[];
  readonly job?: {
    readonly productionUnitId: string;
    readonly category: string;
    readonly quantity: number;
    readonly unit: string;
    readonly note?: string;
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw AppError.badRequest('Operazione non valida', 'INVALID_OPERATION');
  return value as Record<string, unknown>;
}
function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000)
    throw AppError.badRequest(`Campo non valido: ${name}`, 'INVALID_OPERATION');
  return value.trim();
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1e12)
    throw AppError.badRequest('La quantità deve essere positiva', 'INVALID_QUANTITY');
  return value;
}
/** Parse untrusted UI and MCP input into the same deterministic command. */
export function parseFarmOperation(value: unknown): FarmOperationInput {
  const input = object(value);
  const date = required(input.date, 'data');
  if (
    !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date.slice(0, 10)).toISOString().slice(0, 10) !== date.slice(0, 10)
  )
    throw AppError.badRequest('Data non valida', 'INVALID_DATE');
  const rows = input.movements ?? [];
  if (!Array.isArray(rows) || rows.length > 100)
    throw AppError.badRequest('Massimo 100 movimenti', 'INVALID_OPERATION');
  const movements = rows.map((value): FarmMovement => {
    const row = object(value);
    if (row.type !== 'IN' && row.type !== 'OUT')
      throw AppError.badRequest('Tipo movimento non valido', 'INVALID_OPERATION');
    const price = row.price ?? 0;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
      throw AppError.badRequest('Prezzo non valido', 'INVALID_PRICE');
    return {
      productId: required(row.productId, 'prodotto'),
      type: row.type,
      quantity: positive(row.quantity),
      unit: required(row.unit, 'unità'),
      price,
      documentReference:
        typeof row.documentReference === 'string' ? row.documentReference.slice(0, 200) : undefined,
    };
  });
  const job = input.job === undefined ? undefined : object(input.job);
  if (!movements.length && !job)
    throw AppError.badRequest('Inserisci un movimento o una attività', 'EMPTY_OPERATION');
  return {
    companyId: required(input.companyId, 'azienda'),
    date: new Date(date).toISOString(),
    reason: required(input.reason, 'causale'),
    movements,
    job: job
      ? {
          productionUnitId: required(job.productionUnitId, 'unità produttiva'),
          category: required(job.category, 'attività'),
          quantity: positive(job.quantity),
          unit: required(job.unit, 'unità'),
          note: typeof job.note === 'string' ? job.note.slice(0, 2000) : undefined,
        }
      : undefined,
  };
}
