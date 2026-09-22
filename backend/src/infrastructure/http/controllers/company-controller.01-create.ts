import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerCreate(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    const {
      name,
      vatNumber,
      cuaa,
      fiscalCode,
      nation,
      city,
      address,
      cap,
      email,
      phoneNumber,
      website,
      logoUrl,
      kind,
      workspaceId,
    } = request.body;

    if (!name || !vatNumber) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const result = await this.createCompanyUseCase.execute({
      name,
      vatNumber,
      cuaa,
      fiscalCode: fiscalCode ?? null,
      nation: nation ?? null,
      city: city ?? null,
      address: address ?? null,
      cap: cap ?? null,
      email: email ?? null,
      phoneNumber: phoneNumber ?? null,
      website: website ?? null,
      logoUrl: logoUrl ?? null,
      kind: kind ?? undefined,
      workspaceId: workspaceId ?? undefined,
      userId: request.user.id,
    });

    return response.status(201).json({
      status: 'success',
      data: {
        company: result.company,
        message: 'Company created successfully. You have been added as admin.',
      },
    });
  }
