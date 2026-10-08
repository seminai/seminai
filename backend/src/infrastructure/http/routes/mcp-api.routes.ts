import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authRateLimiter, createIpRateLimiter } from '../middlewares/rateLimiter';
import { authenticateMcpToken, pollMcpPairing, startMcpPairing } from '../../farm/mcp-connections';
import { readFarmCatalog } from '../../farm/farm-catalog';
import { proposeFarmOperation } from '../../farm/farm-operation-service';
import { prisma } from '../../repositories/Prisma';
import { AppError } from '../../../domain/errors/AppError';

export const mcpApiRouter = Router();
mcpApiRouter.post(
  '/pairings',
  authRateLimiter,
  asyncHandler(async (request, response) =>
    response.status(201).json({ data: await startMcpPairing(request.body.name) }),
  ),
);
mcpApiRouter.post(
  '/pairings/:id/poll',
  createIpRateLimiter(90, 60, 'mcp-poll'),
  asyncHandler(async (request, response) =>
    response.json({
      data: await pollMcpPairing(request.params.id, String(request.body.secret || '')),
    }),
  ),
);
mcpApiRouter.use(
  asyncHandler(async (request, response, next) => {
    const token = request.headers.authorization?.replace(/^Bearer /i, '') || '';
    response.locals.mcpConnection = await authenticateMcpToken(token);
    next();
  }),
);
mcpApiRouter.get(
  '/identity',
  asyncHandler(async (_request, response) => {
    const { id, name, userId, companyId } = response.locals.mcpConnection as Awaited<
      ReturnType<typeof authenticateMcpToken>
    >;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    return response.json({ data: { id, name, userId, companyId, company } });
  }),
);
mcpApiRouter.get(
  '/catalog',
  asyncHandler(async (request, response) => {
    const connection = response.locals.mcpConnection as Awaited<
      ReturnType<typeof authenticateMcpToken>
    >;
    return response.json({
      data: await readFarmCatalog(
        connection.userId,
        connection.companyId,
        String(request.query.kind || ''),
        String(request.query.search || ''),
        Number(request.query.offset || 0),
      ),
    });
  }),
);
mcpApiRouter.post(
  '/proposals',
  asyncHandler(async (request, response) => {
    const connection = response.locals.mcpConnection as Awaited<
      ReturnType<typeof authenticateMcpToken>
    >;
    if (
      request.body.operation?.companyId &&
      request.body.operation.companyId !== connection.companyId
    )
      throw AppError.forbidden('Azienda non autorizzata', 'COMPANY_ACCESS_DENIED');
    return response.status(201).json({
      data: await proposeFarmOperation(
        connection.userId,
        { ...request.body.operation, companyId: connection.companyId },
        request.body.idempotencyKey,
        connection.id,
      ),
    });
  }),
);
mcpApiRouter.get(
  '/proposals/:id',
  asyncHandler(async (request, response) => {
    const connection = response.locals.mcpConnection as Awaited<
      ReturnType<typeof authenticateMcpToken>
    >;
    const operation = await prisma.farmOperation.findFirst({
      where: {
        id: request.params.id,
        connectionId: connection.id,
        companyId: connection.companyId,
      },
    });
    if (!operation) throw AppError.notFound('Proposta non trovata');
    return response.json({ data: operation });
  }),
);
