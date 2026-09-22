import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { sendgridInboundAuth } from '../middlewares/sendgridInboundAuth';
import {
  emailInboundUpload,
  emailInboundMulterErrorHandler,
} from '../../services/email-ingestion/email-inbound-multer';
import { EmailInboundWebhookController } from '../controllers/EmailInboundWebhookController';
import {
  DispatchToAgentUseCase,
  HandleDisambiguationReplyUseCase,
  ProcessInboundEmailUseCase,
  ResolveSenderUseCase,
  SendDisambiguationRequestEmailUseCase,
  SendIngestionConfirmationEmailUseCase,
  SendOptOutEmailUseCase,
  SendUnknownSenderEmailUseCase,
} from '../../../application/use-cases/email-inbound';
import { PrismaEmailIngestionRepository } from '../../repositories/PrismaEmailIngestionRepository';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaSettingsRepository } from '../../repositories/PrismaSettingsRepository';
import { prisma } from '../../repositories/Prisma';
import { EmailIngestionAttachmentStorage } from '../../services/email-ingestion/EmailIngestionAttachmentStorage';
import { FileService } from '../../services/FileService';
import { type EmailIngestionLimitsDto } from '../../../domain/dtos/email-inbound.dto';

const emailInboundRouter = Router();

const DEFAULT_LIMITS: EmailIngestionLimitsDto = {
  maxAttachments: 20,
  maxTotalBytes: 50 * 1024 * 1024,
  maxPerFileBytes: 26 * 1024 * 1024,
  maxCompaniesInDisambiguation: 10,
};

function resolveLimits(): EmailIngestionLimitsDto {
  const fromEnv = (key: string, fallback: number): number => {
    const raw = process.env[key];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
  };
  return {
    maxAttachments: fromEnv('EMAIL_INGEST_MAX_ATTACHMENTS', DEFAULT_LIMITS.maxAttachments),
    maxTotalBytes: fromEnv('EMAIL_INGEST_MAX_TOTAL_SIZE_BYTES', DEFAULT_LIMITS.maxTotalBytes),
    maxPerFileBytes: fromEnv('EMAIL_INGEST_MAX_PER_FILE_BYTES', DEFAULT_LIMITS.maxPerFileBytes),
    maxCompaniesInDisambiguation: fromEnv(
      'EMAIL_INGEST_MAX_DISAMBIGUATION_COMPANIES',
      DEFAULT_LIMITS.maxCompaniesInDisambiguation,
    ),
  };
}

function buildController(): EmailInboundWebhookController {
  const emailIngestionRepository = new PrismaEmailIngestionRepository();
  const userRepository = new PrismaUserRepository(prisma);
  const companyRepository = new PrismaCompanyRepository(prisma);
  const chatRepository = new PrismaChatRepository(prisma);
  const settingsRepository = new PrismaSettingsRepository(prisma);
  const fileService = new FileService();
  const attachmentStorage = new EmailIngestionAttachmentStorage(fileService);
  const resolveSenderUseCase = new ResolveSenderUseCase(
    userRepository,
    companyRepository,
    settingsRepository,
  );
  const dispatchToAgentUseCase = new DispatchToAgentUseCase(
    chatRepository,
    userRepository,
    companyRepository,
  );
  const handleDisambiguationReplyUseCase = new HandleDisambiguationReplyUseCase(
    emailIngestionRepository,
    resolveSenderUseCase,
    dispatchToAgentUseCase,
    fileService,
  );
  const sendDisambiguationRequestEmailUseCase = new SendDisambiguationRequestEmailUseCase();
  const sendIngestionConfirmationEmailUseCase = new SendIngestionConfirmationEmailUseCase();
  const sendUnknownSenderEmailUseCase = new SendUnknownSenderEmailUseCase();
  const sendOptOutEmailUseCase = new SendOptOutEmailUseCase();
  const processInboundEmailUseCase = new ProcessInboundEmailUseCase({
    emailIngestionRepository,
    userRepository,
    companyRepository,
    attachmentStorage,
    resolveSenderUseCase,
    dispatchToAgentUseCase,
    handleDisambiguationReplyUseCase,
    sendDisambiguationRequestEmailUseCase,
    sendIngestionConfirmationEmailUseCase,
    sendUnknownSenderEmailUseCase,
    sendOptOutEmailUseCase,
    limits: resolveLimits(),
  });
  return new EmailInboundWebhookController(processInboundEmailUseCase);
}

const controller = buildController();

emailInboundRouter.post(
  '/sendgrid',
  sendgridInboundAuth,
  emailInboundUpload.any(),
  emailInboundMulterErrorHandler,
  asyncHandler((req, res) => controller.handle(req, res)),
);

emailInboundRouter.get('/sendgrid/health', (_req, res) => {
  res.json({
    status: 'ok',
    configured: Boolean(process.env.SENDGRID_INBOUND_WEBHOOK_TOKEN),
    timestamp: new Date().toISOString(),
  });
});

export { emailInboundRouter };
