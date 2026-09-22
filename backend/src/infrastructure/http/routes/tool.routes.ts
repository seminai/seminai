import { Router } from 'express';
import { ToolController } from '../controllers/ToolController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { bulkExtractRateLimiter } from '../middlewares/rateLimiter';
import { upload } from '../../services/Multer';

const toolRouter = Router();
const toolController = new ToolController();

toolRouter.get(
  '/get-disciplinari-from-bdf',
  asyncHandler(toolController.getDisciplinariFromBdf.bind(toolController)),
);

toolRouter.get(
  '/get-token-costs',
  ensureAuthenticated,
  asyncHandler(toolController.getTokenCosts.bind(toolController)),
);

toolRouter.post(
  '/extract-brogliacci',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(toolController.extractDataFromBrogliacci.bind(toolController)),
);

export { toolRouter };
