import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { DeactivateUserUseCase } from '../../../application/use-cases/admin/DeactivateUserUseCase';
import { GetAdminDashboardSummaryUseCase } from '../../../application/use-cases/admin/GetAdminDashboardSummaryUseCase';
import { ReactivateUserUseCase } from '../../../application/use-cases/admin/ReactivateUserUseCase';
import { SetUserBlockedStatusUseCase } from '../../../application/use-cases/admin/SetUserBlockedStatusUseCase';
import {
  ADMIN_ACCESS_COOKIE_NAME,
  clearAdminAccessCookie,
  isAdminRoutePasswordValid,
  setAdminAccessCookie,
  verifyAdminAccessToken,
} from '../utils/admin-access';

export class AdminController {
  constructor(
    private readonly getAdminDashboardSummaryUseCase: GetAdminDashboardSummaryUseCase,
    private readonly setUserBlockedStatusUseCase: SetUserBlockedStatusUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
    private readonly reactivateUserUseCase: ReactivateUserUseCase,
  ) {}

  async getAccessStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    const adminAccessToken = request.cookies?.[ADMIN_ACCESS_COOKIE_NAME];
    const payload =
      typeof adminAccessToken === 'string' ? verifyAdminAccessToken(adminAccessToken) : null;
    if (!payload || payload.userId !== request.user.id) {
      clearAdminAccessCookie(response, request);
      return response.json({
        status: 'success',
        data: {
          isUnlocked: false,
          durationMinutes: 30,
        },
      });
    }
    return response.json({
      status: 'success',
      data: {
        isUnlocked: true,
        durationMinutes: 30,
      },
    });
  }

  async unlockAccess(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    const { password } = request.body as { password?: string };
    if (!password) {
      throw AppError.badRequest('Password is required', 'ADMIN_PASSWORD_REQUIRED');
    }
    if (!isAdminRoutePasswordValid(password)) {
      throw AppError.forbidden('Invalid admin route password', 'ADMIN_PASSWORD_INVALID');
    }
    setAdminAccessCookie(response, request, request.user.id);
    return response.json({
      status: 'success',
      data: {
        isUnlocked: true,
        durationMinutes: 30,
      },
    });
  }

  async getDashboardSummary(_request: Request, response: Response): Promise<Response> {
    const summary = await this.getAdminDashboardSummaryUseCase.execute();
    return response.json({
      status: 'success',
      data: summary,
    });
  }

  async updateBlockedStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    const { userId } = request.params;
    const { isBlocked, reason } = request.body as {
      isBlocked?: boolean;
      reason?: string;
    };
    if (typeof isBlocked !== 'boolean') {
      throw AppError.badRequest('isBlocked must be a boolean', 'INVALID_BLOCK_STATUS');
    }
    const user = await this.setUserBlockedStatusUseCase.execute({
      adminUserId: request.user.id,
      targetUserId: userId,
      isBlocked,
      reason,
    });
    return response.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isBlocked: user.isBlocked,
          blockedAt: user.blockedAt,
          blockedReason: user.blockedReason,
        },
      },
    });
  }

  async deactivateUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    const { userId } = request.params;
    const { reason } = request.body as { reason?: string };
    const user = await this.deactivateUserUseCase.execute({
      adminUserId: request.user.id,
      targetUserId: userId,
      reason,
    });
    return response.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isBlocked: user.isBlocked,
          isDeactivated: user.isDeactivated,
          deactivatedAt: user.deactivatedAt,
          deactivatedReason: user.deactivatedReason,
        },
      },
    });
  }

  async reactivateUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    const { userId } = request.params;
    const user = await this.reactivateUserUseCase.execute({
      adminUserId: request.user.id,
      targetUserId: userId,
    });
    return response.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          isBlocked: user.isBlocked,
          isDeactivated: user.isDeactivated,
          blockedAt: user.blockedAt,
          blockedReason: user.blockedReason,
          deactivatedAt: user.deactivatedAt,
          deactivatedReason: user.deactivatedReason,
        },
      },
    });
  }
}
