import { Router } from 'express';
import { SettingsController } from '../controllers/SettingsController';
import { PrismaSettingsRepository } from '../../repositories/PrismaSettingsRepository';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const settingsRouter = Router();
const settingsRepository = new PrismaSettingsRepository(prisma);
const settingsController = new SettingsController(settingsRepository);

settingsRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.create(req, res)),
);

settingsRouter.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getMine(req, res)),
);

// ============================================
// WHATSAPP INTEGRATION ROUTES
// ============================================

settingsRouter.post(
  '/whatsapp/setup',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.setupWhatsApp(req, res)),
);

settingsRouter.get(
  '/whatsapp/qr-code',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getWhatsAppQrCode(req, res)),
);

settingsRouter.get(
  '/whatsapp/status',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getWhatsAppStatus(req, res)),
);

settingsRouter.post(
  '/whatsapp/disconnect',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.disconnectWhatsApp(req, res)),
);

settingsRouter.post(
  '/whatsapp/send-message',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.sendWhatsAppMessage(req, res)),
);

settingsRouter.get(
  '/whatsapp/allowlist',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getWhatsAppAllowlist(req, res)),
);

settingsRouter.post(
  '/whatsapp/allowlist',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.addWhatsAppAllowedNumber(req, res)),
);

settingsRouter.delete(
  '/whatsapp/allowlist/:phoneNumber',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.removeWhatsAppAllowedNumber(req, res)),
);

// ============================================
// END WHATSAPP ROUTES
// ============================================

settingsRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getById(req, res)),
);

settingsRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.update(req, res)),
);

settingsRouter.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.delete(req, res)),
);

settingsRouter.get(
  '/email-inbound',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getEmailInboundStatus(req, res)),
);

settingsRouter.patch(
  '/email-inbound',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.updateEmailInbound(req, res)),
);

settingsRouter.get(
  '/open-meteo',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getOpenMeteoStatus(req, res)),
);

settingsRouter.patch(
  '/open-meteo',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.updateOpenMeteo(req, res)),
);

settingsRouter.get(
  '/qdc-sync',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getQdcSyncStatus(req, res)),
);

settingsRouter.patch(
  '/qdc-sync',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.updateQdcSync(req, res)),
);

export { settingsRouter };
