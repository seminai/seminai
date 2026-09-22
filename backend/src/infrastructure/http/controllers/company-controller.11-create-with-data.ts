import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { Field } from '../../../domain/entities/Field';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { CompanyDataExtraction } from '../../services/agents/company/company_data_extractor_agent';
import { resolveFieldConductionDates } from '../../utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../utils/resolve-field-sau-ha';
import { resolvePuDateOrDefault } from '../../utils/production-unit-date-defaults';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerCreateWithData(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.fieldRepository || !this.productionUnitRepository) {
      throw AppError.badRequest(
        'Field and ProductionUnit repositories not configured',
        'REPOSITORIES_NOT_CONFIGURED',
      );
    }

    const { company, fields, productionUnits } = request.body as CompanyDataExtraction;

    if (!company || !company.name) {
      throw AppError.badRequest('Missing company data', 'MISSING_COMPANY');
    }

    // Step 1: Create company
    const createdCompany = await this.createCompanyUseCase.execute({
      name: company.name,
      vatNumber: company.vatNumber || company.fiscalCode || `VAT-${Date.now()}`,
      cuaa: company.cuaa,
      fiscalCode: company.fiscalCode || company.vatNumber || `FC-${Date.now()}`,
      nation: company.nation,
      city: company.city,
      address: company.address,
      cap: company.cap,
      email: null,
      phoneNumber: null,
      website: null,
      logoUrl: null,
      userId: request.user.id,
    });

    const companyId = createdCompany.company.id;
    let createdFieldsCount = 0;
    let createdProductionUnitsCount = 0;

    // Step 2: Create fields if provided
    if (Array.isArray(fields) && fields.length > 0) {
      const fieldEntities = fields.map((f) => {
        const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
          f.inizioConduzione,
          f.fineConduzione,
        );
        return Field.create({
          companyId,
          sourceFileId:
            'sourceFileId' in f && typeof f.sourceFileId === 'string' ? f.sourceFileId : null,
          name: f.name,
          coordinates: [],
          latitude: null,
          longitude: null,
          polygon: null,
          gisHa: f.gisHa,
          sauHa: resolveFieldSauHa(f.sauHa, f.gisHa, f.superficieCatastaleMq),
          ph: f.ph,
          nitrogen: f.nitrogen,
          phosphorus: f.phosphorus,
          potassium: f.potassium,
          calcium: f.calcium,
          magnesium: f.magnesium,
          soilType: f.soilType,
          uso: f.uso,
          qualita: f.qualita,
          superficieCatastaleMq: f.superficieCatastaleMq || 0,
          sezione: f.sezione || 'UNSPECIFIED',
          foglio: f.foglio,
          particella: f.particella,
          subalterno: f.subalterno,
          nation: f.nation,
          region: f.region,
          city: f.city,
          address: f.address || 'N/A',
          cap: f.cap,
          variazioneMq: f.variazioneMq,
          inizioConduzione,
          fineConduzione,
          bufferZoneNotes: null,
        });
      });

      await this.fieldRepository.createMany(fieldEntities);
      createdFieldsCount = fieldEntities.length;
    }

    // Step 3: Create production units if provided
    if (Array.isArray(productionUnits) && productionUnits.length > 0) {
      const productionUnitEntities = productionUnits.map((pu) => {
        // Get first cycle for main crop info
        const primaryCycle = pu.cycles?.[0];

        return ProductionUnit.create({
          name: pu.name,
          areaHa: pu.areaHa ?? 0,
          cropName: primaryCycle?.cropName || 'Non specificato',
          cropType: primaryCycle?.cropType || 'Non specificato',
          variety: primaryCycle?.variety || 'Non specificata',
          protocoll: pu.protocoll || 'N/A',
          protectionStructure: primaryCycle?.protectionStructure || 'Nessuna',
          startDate: resolvePuDateOrDefault(pu.startDate, 'start'),
          endDate: resolvePuDateOrDefault(pu.endDate, 'end'),
          floweringDate: resolvePuDateOrDefault(primaryCycle?.floweringDate, 'start'),
          harvestingDate: resolvePuDateOrDefault(primaryCycle?.harvestingDate, 'end'),
          occupazione: primaryCycle?.occupazione || null,
          destinazioneDiUso: primaryCycle?.destinazione || null,
          acquaTotalePeridoL: 0,
        });
      });

      await this.productionUnitRepository.createMany(productionUnitEntities);
      createdProductionUnitsCount = productionUnitEntities.length;
    }

    return response.status(201).json({
      status: 'success',
      data: {
        company: createdCompany.company,
        createdFieldsCount,
        createdProductionUnitsCount,
        message: 'Company created with fields and production units',
      },
    });
  }
