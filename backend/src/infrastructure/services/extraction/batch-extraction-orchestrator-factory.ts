import { prisma } from '../../repositories/Prisma';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaFileExtractionRepository } from '../../repositories/PrismaFileExtractionRepository';
import { PrismaFileExtractionEditLogRepository } from '../../repositories/PrismaFileExtractionEditLogRepository';
import { PrismaFileRepository } from '../../repositories/PrismaFileRepository';
import { LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { BatchExtractionOrchestrator } from './batch-extraction-orchestrator';

export function createBatchExtractionOrchestrator(): BatchExtractionOrchestrator {
  const logEditUseCase = new LogFileExtractionEditUseCase(
    new PrismaFileExtractionEditLogRepository(),
  );
  return new BatchExtractionOrchestrator(
    new PrismaFieldRepository(prisma),
    new PrismaFileExtractionRepository(),
    new PrismaFileRepository(prisma),
    logEditUseCase,
  );
}
