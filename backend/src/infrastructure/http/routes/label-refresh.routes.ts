import { Router } from 'express';
import { LABEL_MODIFY_ROLES } from '../../../domain/constants/label-roles';
import { LabelRefreshController } from '../controllers/LabelRefreshController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureUserRole } from '../middlewares/ensureUserRole';

export const labelRefreshRouter = Router();
const controller = new LabelRefreshController();

labelRefreshRouter.post(
  '/:id/refresh',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.enqueueSingleLabel(req, res)),
);
