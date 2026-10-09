import { JobCategory, Prisma } from '@prisma/client';
import { AppError } from '../../domain/errors/AppError';
import { parseFarmOperation } from '../../domain/services/farm/operation-input';
import { prisma } from '../repositories/Prisma';
import { previewFarmOperation, requireFarmMember } from './farm-preview';
import { convertQuantityToCanonicalUnit } from '../utils/quantityConversion';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Proposals persist across restart and never mutate the journal before a human approval. */
export async function proposeFarmOperation(
  userId: string,
  value: unknown,
  idempotencyKey: string,
  connectionId?: string,
) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200)
    throw AppError.badRequest('Chiave richiesta mancante', 'IDEMPOTENCY_REQUIRED');
  const input = parseFarmOperation(value);
  return prisma.$transaction(async (database) => {
    await requireFarmMember(database, userId, input.companyId, true);
    await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ':' + idempotencyKey}, 0))`;
    const existing = await database.farmOperation.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (existing) {
      if (
        JSON.stringify(parseFarmOperation(existing.payload)) !== JSON.stringify(input) ||
        existing.connectionId !== (connectionId ?? null)
      )
        throw AppError.conflict('Chiave già usata per un’altra operazione', 'IDEMPOTENCY_CONFLICT');
      return existing;
    }
    const preview = await previewFarmOperation(database, input);
    const operation = await database.farmOperation.create({
      data: {
        userId,
        companyId: input.companyId,
        connectionId,
        idempotencyKey,
        payload: json(input),
        preview: json(preview),
      },
    });
    await database.farmAudit.create({
      data: {
        operationId: operation.id,
        actorId: userId,
        action: 'proposed',
        version: 1,
        detail: json({ input, connectionId }),
      },
    });
    return operation;
  });
}

export async function reviseFarmOperation(
  userId: string,
  id: string,
  version: number,
  value: unknown,
) {
  const input = parseFarmOperation(value);
  return prisma.$transaction(async (database) => {
    await database.$queryRaw`SELECT id FROM "FarmOperation" WHERE id = ${id} FOR UPDATE`;
    const operation = await database.farmOperation.findUniqueOrThrow({ where: { id } });
    await requireFarmMember(database, userId, operation.companyId, true);
    if (
      operation.status !== 'pending' ||
      operation.version !== version ||
      input.companyId !== operation.companyId
    )
      throw AppError.conflict('Proposta cambiata: aggiorna la pagina', 'STALE_PROPOSAL');
    const preview = await previewFarmOperation(database, input);
    const updated = await database.farmOperation.update({
      where: { id },
      data: { payload: json(input), preview: json(preview), version: { increment: 1 } },
    });
    await database.farmAudit.create({
      data: {
        operationId: id,
        actorId: userId,
        action: 'revised',
        version: updated.version,
        detail: json(input),
      },
    });
    return updated;
  });
}

export async function reviewFarmOperation(
  userId: string,
  id: string,
  version: number,
  decision: 'approve' | 'reject',
  negativeReason?: string,
) {
  return prisma.$transaction(
    async (database) => {
      await database.$queryRaw`SELECT id FROM "FarmOperation" WHERE id = ${id} FOR UPDATE`;
      const operation = await database.farmOperation.findUniqueOrThrow({ where: { id } });
      await requireFarmMember(database, userId, operation.companyId, true);
      if (operation.status !== 'pending') return { needsReview: false, operation };
      if (operation.version !== version)
        throw AppError.conflict('Proposta cambiata: aggiorna la pagina', 'STALE_PROPOSAL');
      if (decision === 'reject') {
        const updated = await database.farmOperation.update({
          where: { id },
          data: { status: 'rejected', reviewedBy: userId, reviewedAt: new Date(), result: {} },
        });
        await database.farmAudit.create({
          data: { operationId: id, actorId: userId, action: 'rejected', version, detail: {} },
        });
        return { needsReview: false, operation: updated };
      }
      if (operation.connectionId) {
        await database.$queryRaw`SELECT id FROM "McpConnection" WHERE id = ${operation.connectionId} FOR UPDATE`;
        const connection = await database.mcpConnection.findUnique({
          where: { id: operation.connectionId },
        });
        if (!connection || connection.revokedAt)
          throw AppError.conflict('Collegamento revocato', 'CONNECTION_REVOKED');
        await requireFarmMember(database, connection.userId, operation.companyId, true);
      }
      const input = parseFarmOperation(operation.payload);
      const preview = await previewFarmOperation(database, input);
      if (
        decision === 'approve' &&
        preview.fingerprint !== (operation.preview as { fingerprint?: string }).fingerprint
      ) {
        const updated = await database.farmOperation.update({
          where: { id },
          data: { preview: json(preview), version: { increment: 1 } },
        });
        await database.farmAudit.create({
          data: {
            operationId: id,
            actorId: userId,
            action: 'balance_changed',
            version: updated.version,
            detail: json(preview),
          },
        });
        return { needsReview: true, operation: updated };
      }
      if (
        decision === 'approve' &&
        preview.negativeStock &&
        (typeof negativeReason !== 'string' ||
          !negativeReason.trim() ||
          negativeReason.length > 2000)
      )
        throw AppError.conflict(
          'Conferma il saldo negativo indicando una motivazione',
          'NEGATIVE_STOCK_CONFIRMATION_REQUIRED',
        );
      const result =
        decision === 'approve' ? await persistFarmOperation(database, userId, id, input) : {};
      const updated = await database.farmOperation.update({
        where: { id },
        data: {
          status: decision === 'approve' ? 'approved' : 'rejected',
          reviewedBy: userId,
          reviewedAt: new Date(),
          result: json(result),
        },
      });
      await database.farmAudit.create({
        data: {
          operationId: id,
          actorId: userId,
          action: updated.status,
          version,
          detail: json({ input, preview, result, negativeReason }),
        },
      });
      return { needsReview: false, operation: updated };
    },
    { timeout: 15000 },
  );
}

async function persistFarmOperation(
  database: Prisma.TransactionClient,
  userId: string,
  operationId: string,
  input: ReturnType<typeof parseFarmOperation>,
) {
  const job = input.job
    ? await database.job.create({
        data: {
          productionUnitId: input.job.productionUnitId,
          category: input.job.category as JobCategory,
          dateOfOpeation: new Date(input.date),
          quantity: input.job.quantity,
          unitOfMeasureQuantity: input.job.unit,
          note: input.job.note || input.reason,
          userId,
          isVerified: true,
          conformityChecked: false,
        },
      })
    : undefined;
  const stockIds: string[] = [];
  for (const movement of input.movements) {
    const quantity = movement.quantity * (movement.type === 'OUT' ? -1 : 1);
    const canonical = convertQuantityToCanonicalUnit(quantity, movement.unit)!;
    const stock = await database.stock.create({
      data: {
        productId: movement.productId,
        quantity,
        unitOfMeasureQuantity: movement.unit,
        type: movement.type,
        price: movement.price,
        unitOfMeasurePrice: 'EUR',
        reason: input.reason,
        occurredAt: new Date(input.date),
        recordedBy: userId,
        operationId,
        jobId: job?.id,
        ddtCode: movement.documentReference,
        quantityConverted: canonical.quantityConverted,
        unitMeasureConverted: canonical.unitMeasureConverted,
      },
    });
    stockIds.push(stock.id);
  }
  return { jobId: job?.id, stockIds };
}
