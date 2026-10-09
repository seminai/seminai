import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../repositories/Prisma';
import { AppError } from '../../domain/errors/AppError';
import { requireFarmMember } from './farm-preview';
import { encryptAesGcm, decryptAesGcm } from '../settings/aesGcm';

export function hashMcpSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function authenticateMcpToken(token: string) {
  if (!token.startsWith('sem_mcp_'))
    throw AppError.unauthorized('Collegamento MCP richiesto', 'MCP_UNAUTHORIZED');
  const connection = await prisma.mcpConnection.findUnique({
    where: { tokenHash: hashMcpSecret(token) },
  });
  if (!connection || connection.revokedAt)
    throw AppError.unauthorized('Collegamento scaduto o revocato', 'MCP_UNAUTHORIZED');
  await requireFarmMember(prisma, connection.userId, connection.companyId);
  return connection;
}

export async function createMcpConnection(userId: string, companyId: string, name: string) {
  await requireFarmMember(prisma, userId, companyId);
  if (typeof name !== 'string' || !name.trim() || name.length > 100)
    throw AppError.badRequest('Nome collegamento non valido', 'INVALID_CONNECTION');
  const token = `sem_mcp_${randomBytes(32).toString('hex')}`;
  const connection = await prisma.mcpConnection.create({
    data: { userId, companyId, name, tokenHash: hashMcpSecret(token) },
  });
  return { id: connection.id, token, name, companyId };
}

export async function startMcpPairing(name: string) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100)
    throw AppError.badRequest('Nome client non valido', 'INVALID_CONNECTION');
  const secret = randomBytes(32).toString('hex');
  const pairing = await prisma.mcpPairing.create({
    data: { name, secretHash: hashMcpSecret(secret), expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  return { id: pairing.id, secret, expiresAt: pairing.expiresAt };
}

export async function approveMcpPairing(userId: string, id: string, companyId: string) {
  return prisma.$transaction(async (database) => {
    await database.$queryRaw`SELECT id FROM "McpPairing" WHERE id = ${id} FOR UPDATE`;
    const pairing = await database.mcpPairing.findUnique({ where: { id } });
    if (!pairing || pairing.approvedAt || pairing.expiresAt.getTime() < Date.now())
      throw AppError.conflict('Richiesta di collegamento scaduta', 'PAIRING_EXPIRED');
    await requireFarmMember(database, userId, companyId);
    const token = `sem_mcp_${randomBytes(32).toString('hex')}`;
    await database.mcpConnection.create({
      data: { userId, companyId, name: pairing.name, tokenHash: hashMcpSecret(token) },
    });
    await database.mcpPairing.update({
      where: { id },
      data: {
        approvedAt: new Date(),
        tokenEnc: encryptAesGcm(token, process.env.ENCRYPTION_SECRET!),
      },
    });
    return { approved: true };
  });
}

export async function pollMcpPairing(id: string, secret: string) {
  return prisma.$transaction(async (database) => {
    await database.$queryRaw`SELECT id FROM "McpPairing" WHERE id = ${id} FOR UPDATE`;
    const pairing = await database.mcpPairing.findUnique({ where: { id } });
    if (
      !pairing ||
      pairing.secretHash !== hashMcpSecret(secret) ||
      pairing.consumedAt ||
      pairing.expiresAt.getTime() < Date.now()
    )
      throw AppError.unauthorized('Richiesta scaduta', 'PAIRING_EXPIRED');
    if (!pairing.tokenEnc) return { pending: true };
    const token = decryptAesGcm(pairing.tokenEnc, process.env.ENCRYPTION_SECRET!);
    await database.mcpPairing.update({
      where: { id },
      data: { consumedAt: new Date(), tokenEnc: null },
    });
    return { pending: false, token };
  });
}
