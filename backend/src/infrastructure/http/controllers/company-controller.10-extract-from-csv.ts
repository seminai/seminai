import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { FieldCsvAgent } from '../../services/agents/file_agent/field_csv_agent';
import { ProductionUnitCsvAgent } from '../../services/agents/production_unit/production_unit_csv_agent';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerExtractFromCsv(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    // Check if companyId is provided in the body (multipart/form-data)
    const companyId = request.body?.companyId as string | undefined;

    try {
      const agent = this.getCompanyDataExtractorAgent();

      // If companyId is provided, use existing company and skip extraction
      if (companyId) {
        // Validate company exists and user has access
        const company = await this.companyRepository.findById(companyId);
        if (!company) {
          throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
        }

        // Check user has access to this company
        const userOnCompany = await this.userOnCompanyRepository.findByCompanyAndUser(
          companyId,
          request.user.id,
        );
        if (!userOnCompany) {
          throw AppError.forbidden(
            'User does not have access to this company',
            'NO_COMPANY_ACCESS',
          );
        }

        // Extract only fields and production units (skip company extraction)
        const fieldAgent = new FieldCsvAgent();
        const productionUnitAgent = new ProductionUnitCsvAgent();

        const fieldsResult = await fieldAgent.extractFieldsFromCsv(file.buffer);
        const puExtractionResult = await productionUnitAgent.extractProductionUnitsFromCsv(
          file.buffer,
        );

        return response.json({
          status: 'success',
          data: {
            company: {
              id: company.id,
              name: company.name,
              vatNumber: company.vatNumber,
              fiscalCode: company.fiscalCode,
              cuaa: company.cuaa,
              nation: company.nation,
              region: null, // Company entity doesn't have region field
              city: company.city,
              address: company.address,
              cap: company.cap,
            },
            fields: fieldsResult.fields,
            productionUnits: puExtractionResult.units,
            summary: {
              fieldsCount: fieldsResult.fields.length,
              productionUnitsCount: puExtractionResult.units.length,
            },
            diagnostics: {
              fields: fieldsResult.diagnostics,
              productionUnits: puExtractionResult.diagnostics,
            },
          },
        });
      }

      // Default behavior: extract everything including company
      const extraction = await agent.extractFromCsv(file.buffer);

      return response.json({
        status: 'success',
        data: {
          companies: extraction.companies,
          company: extraction.company,
          fields: extraction.fields,
          productionUnits: extraction.productionUnits,
          summary: {
            fieldsCount: extraction.fields.length,
            productionUnitsCount: extraction.productionUnits.length,
          },
        },
      });
    } catch (error) {
      console.error('Error during company data extraction:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw AppError.internal('Company data extraction failed', 'EXTRACTION_FAILED');
    }
  }
