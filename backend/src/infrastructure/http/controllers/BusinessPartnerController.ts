import { Request, Response } from 'express';
import { PartnerType } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { CreateBusinessPartnerUseCase } from '../../../application/use-cases/business-partner/CreateBusinessPartnerUseCase';
import { UpdateBusinessPartnerUseCase } from '../../../application/use-cases/business-partner/UpdateBusinessPartnerUseCase';
import { SearchBusinessPartnersUseCase } from '../../../application/use-cases/business-partner/SearchBusinessPartnersUseCase';

const UPDATABLE_KEYS: ReadonlyArray<keyof BusinessPartner> = [
  'type',
  'name',
  'vatNumber',
  'fiscalCode',
  'sdiCode',
  'pec',
  'email',
  'phone',
  'referent',
  'nation',
  'city',
  'address',
  'cap',
  'deliveryAddress',
  'deliveryCity',
  'deliveryCap',
  'deliveryNation',
  'deliveryNotesText',
  'deliveryHours',
  'followUpEnabled',
  'isActive',
];

function parsePartnerType(value: unknown): PartnerType | undefined {
  if (value === PartnerType.CUSTOMER || value === PartnerType.SUPPLIER) return value;
  return undefined;
}

/** REST controller for the unified customer/supplier anagrafica. */
export class BusinessPartnerController {
  constructor(
    private readonly createUseCase: CreateBusinessPartnerUseCase,
    private readonly updateUseCase: UpdateBusinessPartnerUseCase,
    private readonly searchUseCase: SearchBusinessPartnersUseCase,
    private readonly partnerRepository: IBusinessPartnerRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { companyId, type } = request.body as { companyId?: string; type?: PartnerType };
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    const partnerType = parsePartnerType(type);
    if (!partnerType)
      throw AppError.badRequest('type must be CUSTOMER or SUPPLIER', 'INVALID_TYPE');
    await this.assertCompanyAccess(companyId, userId);
    const result = await this.createUseCase.execute({
      ...request.body,
      companyId,
      type: partnerType,
    });
    return response.status(201).json({
      status: 'success',
      data: { partner: result.partner, reused: result.reused },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const existing = await this.partnerRepository.findById(id);
    if (!existing) throw AppError.notFound('Business partner not found', 'PARTNER_NOT_FOUND');
    await this.assertCompanyAccess(existing.companyId, userId);
    const data: Partial<BusinessPartner> = {};
    const body = request.body as Record<string, unknown>;
    for (const key of UPDATABLE_KEYS) {
      if (key in body) (data as Record<string, unknown>)[key] = body[key];
    }
    const updated = await this.updateUseCase.execute({ id, data });
    return response.json({ status: 'success', data: { partner: updated } });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.query.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const partners = await this.searchUseCase.execute({
      companyId,
      type: parsePartnerType(request.query.type),
      query: request.query.q as string | undefined,
    });
    return response.json({ status: 'success', data: { partners } });
  }

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  private async assertCompanyAccess(companyId: string, userId: string): Promise<void> {
    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(companyId, userId);
    if (!membership) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
  }
}
