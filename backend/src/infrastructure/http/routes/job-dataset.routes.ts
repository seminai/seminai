import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { CsvTreatmentController } from '../controllers/JobDatasetController';

export const csvTreatmentsRouter = Router();
const controller = new CsvTreatmentController();

csvTreatmentsRouter.get(
  '/company-overview/year/:year',
  asyncHandler((req, res) => controller.companyOverviewByYear(req, res)),
);

csvTreatmentsRouter.post(
  '/company-ground-truth/year/:year',
  asyncHandler((req, res) => controller.companyGroundTruthByYear(req, res)),
);

csvTreatmentsRouter.post(
  '/company-input-ground-truth/year/:year',
  asyncHandler((req, res) => controller.companyInputGroundTruthByYear(req, res)),
);

csvTreatmentsRouter.post(
  '/company-unit-treatments/year/:year',
  asyncHandler((req, res) => controller.companyUnitTreatmentsByYear(req, res)),
);
