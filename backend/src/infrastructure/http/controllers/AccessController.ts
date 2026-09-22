import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { bootstrapInviteCode, rotateInviteCode } from '../../runtime/bootstrapInviteCode';
import { buildInviteUrl, resolveAccessMode, resolvePublicBaseUrl } from '../../runtime/resolvePublicBaseUrl';
import { resolveTunnelHealth } from '../../runtime/tunnelHealth';
import { inviteQrDataUrl } from '../inviteQr';

function requireAdmin(request: Request): void {
  const role = request.user?.role;
  if (role !== UserRole.ADMIN && role !== UserRole.GOD) {
    throw AppError.forbidden('Admin role required', 'ADMIN_ROLE_REQUIRED');
  }
}

async function buildStatusPayload(rotate: boolean) {
  const code = rotate ? rotateInviteCode() : bootstrapInviteCode();
  const inviteUrl = buildInviteUrl(code);
  return {
    accessMode: resolveAccessMode(),
    publicBaseUrl: resolvePublicBaseUrl(),
    inviteRequired: true,
    inviteCode: code,
    inviteUrl,
    qrDataUrl: await inviteQrDataUrl(inviteUrl),
    tunnel: resolveTunnelHealth(),
  };
}

export class AccessController {
  async status(request: Request, response: Response): Promise<Response> {
    requireAdmin(request);
    return response.json({ status: 'success', data: await buildStatusPayload(false) });
  }

  async rotateInvite(request: Request, response: Response): Promise<Response> {
    requireAdmin(request);
    return response.json({ status: 'success', data: await buildStatusPayload(true) });
  }
}
