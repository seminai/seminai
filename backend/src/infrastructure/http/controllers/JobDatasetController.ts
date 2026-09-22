import { Request, Response } from 'express';
import {
  getYearCompanyOverview,
  getCompanyGroundTruthByYear,
  getCompanyInputGroundTruthByYear,
  getCompanyUnitTreatmentsWithDatesByYear,
} from '../../services/treatmet_extraction_dataset/get_year_crop_field';

/**
 * Controller to expose CSV-based treatment summaries grouped by company and fields.
 */
export class CsvTreatmentController {
  /**
   * Return companies with a flat list of fields and aggregated treatments totals per company for a given year.
   * Route params: year (number)
   * Query params: csvPath (optional absolute/relative CSV file path).
   */
  public async companyOverviewByYear(req: Request, res: Response): Promise<Response> {
    try {
      const rawYear: string = String(req.params['year'] ?? '').trim();
      const csvPath: string = String(req.query['csvPath'] ?? '').trim();
      const name: string = String(req.query['name'] ?? '').trim();
      const crop: string = String(req.query['crop'] ?? '').trim();
      const variety: string = String(req.query['variety'] ?? '').trim();

      const year: number = Number(rawYear);
      if (!Number.isFinite(year) || year < 1900 || year > 3000) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid or missing year. Expected YYYY.' });
      }

      const data = await getYearCompanyOverview(year, csvPath || undefined, {
        name,
        crop,
        variety,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      const message: string = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ success: false, message });
    }
  }

  /**
   * Return UnitAllowedProductsOutput-like ground truth for a given company and year.
   * Params: year (number)
   * Body: { company: string, csvPath?: string, ftsCsvPath?: string, ftsJsonPath?: string }
   */
  public async companyGroundTruthByYear(req: Request, res: Response): Promise<Response> {
    try {
      const rawYear: string = String(req.params['year'] ?? '').trim();
      const year: number = Number(rawYear);
      if (!Number.isFinite(year) || year < 1900 || year > 3000) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid or missing year. Expected YYYY.' });
      }

      const body = (req.body || {}) as {
        company?: string;
        csvPath?: string;
        ftsCsvPath?: string;
        ftsJsonPath?: string;
      };
      const company: string = String(body.company ?? '').trim();
      const csvPath: string = String(body.csvPath ?? '').trim();
      const ftsCsvPath: string = String(body.ftsCsvPath ?? '').trim();
      const ftsJsonPath: string = String(body.ftsJsonPath ?? '').trim();
      if (!company) {
        return res.status(400).json({ success: false, message: 'Missing company in body.' });
      }

      const raw = await getCompanyGroundTruthByYear(
        year,
        company,
        csvPath || undefined,
        ftsCsvPath || undefined,
        ftsJsonPath || undefined,
      );
      return res.status(200).json({ success: true, data: raw });
    } catch (error) {
      const message: string = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ success: false, message });
    }
  }

  /**
   * Return input-like ground truth with products and productionUnits for a given company and year.
   * Params: year (number)
   * Body: { company: string, csvPath?: string, ftsCsvPath?: string, ftsJsonPath?: string }
   */
  public async companyInputGroundTruthByYear(req: Request, res: Response): Promise<Response> {
    try {
      const rawYear: string = String(req.params['year'] ?? '').trim();
      const year: number = Number(rawYear);
      if (!Number.isFinite(year) || year < 1900 || year > 3000) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid or missing year. Expected YYYY.' });
      }

      const body = (req.body || {}) as {
        company?: string;
        csvPath?: string;
        ftsCsvPath?: string;
        ftsJsonPath?: string;
      };
      const company: string = String(body.company ?? '').trim();
      const csvPath: string = String(body.csvPath ?? '').trim();
      const ftsCsvPath: string = String(body.ftsCsvPath ?? '').trim();
      const ftsJsonPath: string = String(body.ftsJsonPath ?? '').trim();
      if (!company) {
        return res.status(400).json({ success: false, message: 'Missing company in body.' });
      }

      const data = await getCompanyInputGroundTruthByYear(
        year,
        company,
        csvPath || undefined,
        ftsCsvPath || undefined,
        ftsJsonPath || undefined,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      const message: string = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ success: false, message });
    }
  }

  /**
   * Return per-productionUnit products with distribution date and dosage for a company/year from CSV.
   * Params: year (number)
   * Body: { company: string, crop?: string, variety?: string, csvPath?: string, ftsCsvPath?: string, ftsJsonPath?: string }
   */
  public async companyUnitTreatmentsByYear(req: Request, res: Response): Promise<Response> {
    try {
      const rawYear: string = String(req.params['year'] ?? '').trim();
      const year: number = Number(rawYear);
      if (!Number.isFinite(year) || year < 1900 || year > 3000) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid or missing year. Expected YYYY.' });
      }

      const body = (req.body || {}) as {
        company?: string;
        crop?: string;
        variety?: string;
        csvPath?: string;
        ftsCsvPath?: string;
        ftsJsonPath?: string;
      };
      const company: string = String(body.company ?? '').trim();
      const crop: string = String(body.crop ?? '').trim();
      const variety: string = String(body.variety ?? '').trim();
      const csvPath: string = String(body.csvPath ?? '').trim();
      const ftsCsvPath: string = String(body.ftsCsvPath ?? '').trim();
      const ftsJsonPath: string = String(body.ftsJsonPath ?? '').trim();
      if (!company) {
        return res.status(400).json({ success: false, message: 'Missing company in body.' });
      }

      const data = await getCompanyUnitTreatmentsWithDatesByYear(
        year,
        company,
        csvPath || undefined,
        ftsCsvPath || undefined,
        ftsJsonPath || undefined,
        { crop: crop || undefined, variety: variety || undefined },
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      const message: string = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ success: false, message });
    }
  }
}
