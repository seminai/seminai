import { Router } from 'express';
import { LabelRefreshController } from '../controllers/LabelRefreshController';
import { asyncHandler } from '../middlewares/asyncHandler';

export const internalLabelRefreshRouter = Router();
const controller = new LabelRefreshController();

internalLabelRefreshRouter.post(
  '/labels/refresh',
  asyncHandler(async (req, res) => controller.enqueueFromCron(req, res)),
);
