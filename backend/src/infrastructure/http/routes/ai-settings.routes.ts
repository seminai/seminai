import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { readAiSettings, saveAiSettings, testAiSettings } from '../../settings/aiSettings';
import { AppError } from '../../../domain/errors/AppError';

export const aiSettingsRouter = Router();
aiSettingsRouter.use(ensureAuthenticated);
aiSettingsRouter.use((request, _response, next) => {
  if (request.user?.role !== 'GOD')
    return next(
      AppError.forbidden('Solo l’amministratore può configurare i modelli', 'ADMIN_REQUIRED'),
    );
  return next();
});
aiSettingsRouter.get(
  '/',
  asyncHandler(async (_request, response) => response.json({ data: await readAiSettings() })),
);
aiSettingsRouter.put(
  '/',
  asyncHandler(async (request, response) => {
    const data = await saveAiSettings(request.body);
    response.json({ data: { ...data, restartRequired: true } });
    if (process.env.RUNTIME_PROFILE === 'desktop' && process.send)
      setTimeout(() => process.send?.('ai-settings-updated'), 300);
  }),
);
aiSettingsRouter.post(
  '/test',
  asyncHandler(async (_request, response) => response.json({ data: await testAiSettings() })),
);
