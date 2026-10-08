import QRCode from 'qrcode';
import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';
import { AppError } from '../../../domain/errors/AppError';
import {
  proposeFarmOperation,
  reviewFarmOperation,
  reviseFarmOperation,
} from '../../farm/farm-operation-service';
import { requireFarmMember } from '../../farm/farm-preview';
import { readFarmCatalog } from '../../farm/farm-catalog';
import { approveMcpPairing, createMcpConnection } from '../../farm/mcp-connections';

export const farmRouter = Router();
farmRouter.use(ensureAuthenticated);
farmRouter.get(
  '/desktop-admin',
  asyncHandler(async (request, response) => {
    if (request.user?.role !== 'GOD') throw AppError.forbidden('Amministratore richiesto');
    return response.json({ data: { authorized: true } });
  }),
);
farmRouter.get(
  '/desktop-qr',
  asyncHandler(async (request, response) => {
    if (request.user?.role !== 'GOD') throw AppError.forbidden('Amministratore richiesto');
    const address = String(request.query.address || '');
    if (!/^http:\/\/[0-9.]+:\d+$/.test(address)) throw AppError.badRequest('Indirizzo non valido');
    return response
      .type('image/svg+xml')
      .send(await QRCode.toString(address, { type: 'svg', margin: 2 }));
  }),
);
farmRouter.get(
  '/companies',
  asyncHandler(async (request, response) =>
    response.json({
      data: await prisma.company.findMany({
        where: { companyUsers: { some: { userId: request.user!.id } } },
        select: { id: true, name: true },
      }),
    }),
  ),
);
farmRouter.get(
  '/catalog',
  asyncHandler(async (request, response) =>
    response.json({
      data: await readFarmCatalog(
        request.user!.id,
        String(request.query.companyId || ''),
        String(request.query.kind || ''),
        String(request.query.search || ''),
      ),
    }),
  ),
);
farmRouter.get(
  '/operations',
  asyncHandler(async (request, response) => {
    const companyId = String(request.query.companyId || '');
    await requireFarmMember(prisma, request.user!.id, companyId);
    return response.json({
      data: await prisma.farmOperation.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    });
  }),
);
farmRouter.post(
  '/operations',
  asyncHandler(async (request, response) =>
    response.status(201).json({
      data: await proposeFarmOperation(
        request.user!.id,
        request.body.operation,
        request.body.idempotencyKey,
      ),
    }),
  ),
);
farmRouter.put(
  '/operations/:id',
  asyncHandler(async (request, response) =>
    response.json({
      data: await reviseFarmOperation(
        request.user!.id,
        request.params.id,
        request.body.version,
        request.body.operation,
      ),
    }),
  ),
);
farmRouter.post(
  '/operations/:id/review',
  asyncHandler(async (request, response) => {
    if (!['approve', 'reject'].includes(request.body.decision))
      throw AppError.badRequest('Decisione non valida', 'INVALID_DECISION');
    const data = await reviewFarmOperation(
      request.user!.id,
      request.params.id,
      request.body.version,
      request.body.decision,
      request.body.negativeReason,
    );
    return response.status(data.needsReview ? 409 : 200).json({
      data,
      ...(data.needsReview
        ? {
            code: 'STALE_PROPOSAL',
            message: 'Le giacenze sono cambiate. Controlla e conferma il nuovo saldo.',
          }
        : {}),
    });
  }),
);
farmRouter.get(
  '/operations/:id/audit',
  asyncHandler(async (request, response) => {
    const operation = await prisma.farmOperation.findUniqueOrThrow({
      where: { id: request.params.id },
    });
    await requireFarmMember(prisma, request.user!.id, operation.companyId);
    return response.json({
      data: await prisma.farmAudit.findMany({
        where: { operationId: operation.id },
        orderBy: { createdAt: 'asc' },
      }),
    });
  }),
);
farmRouter.get(
  '/connections',
  asyncHandler(async (request, response) =>
    response.json({
      data: await prisma.mcpConnection.findMany({
        where: { userId: request.user!.id },
        select: { id: true, name: true, companyId: true, revokedAt: true, createdAt: true },
      }),
    }),
  ),
);
farmRouter.post(
  '/connections',
  asyncHandler(async (request, response) =>
    response.status(201).json({
      data: await createMcpConnection(request.user!.id, request.body.companyId, request.body.name),
    }),
  ),
);
farmRouter.delete(
  '/connections/:id',
  asyncHandler(async (request, response) => {
    await prisma.mcpConnection.updateMany({
      where: { id: request.params.id, userId: request.user!.id },
      data: { revokedAt: new Date() },
    });
    return response.status(204).end();
  }),
);
farmRouter.get(
  '/pairings/:id',
  asyncHandler(async (request, response) => {
    const pairing = await prisma.mcpPairing.findUnique({
      where: { id: request.params.id },
      select: { name: true, expiresAt: true, approvedAt: true },
    });
    if (!pairing) throw AppError.notFound('Collegamento non trovato');
    return response.json({ data: pairing });
  }),
);
farmRouter.post(
  '/pairings/:id/approve',
  asyncHandler(async (request, response) =>
    response.json({
      data: await approveMcpPairing(request.user!.id, request.params.id, request.body.companyId),
    }),
  ),
);
