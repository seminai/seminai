import { prisma } from '../repositories/Prisma';
import { LlmUsageLogger } from '../services/llm_costs/llm-usage-logger';
import { DeductUserCreditsUseCase } from '../../application/use-cases/user/DeductUserCreditsUseCase';
import { PrismaUserRepository } from '../repositories/PrismaUserRepository';
import { LlmJobType } from '@prisma/client';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueDeductCreditsForJob(this: DosageAgentQueueContext, jobId: string, userId: string): Promise<void> {
    try {
      // Flush pending usage records to ensure all are saved
      const usageLogger = LlmUsageLogger.getInstance();
      await usageLogger.flush();

      // Wait a bit to ensure all records are persisted
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get all usage records for this job (by jobId or jobGroupId)
      const usages = await prisma.llmUsage.findMany({
        where: {
          userId,
          jobType: LlmJobType.DOSAGE,
          OR: [{ jobId }, { jobGroupId: jobId }],
        },
      });

      if (usages.length === 0) {
        console.log(
          `[DOSAGE-QUEUE] No LLM usage found for job ${jobId}, skipping credit deduction`,
        );
        return;
      }

      // Calculate total cost
      const totalCost = usages.reduce((sum, usage) => sum + usage.costClient, 0);

      if (totalCost <= 0) {
        console.log(
          `[DOSAGE-QUEUE] Total cost for job ${jobId} is ${totalCost}, skipping credit deduction`,
        );
        return;
      }

      // Deduct credits
      const userRepository = new PrismaUserRepository(prisma);
      const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
      await deductCreditsUseCase.execute({
        userId,
        amount: totalCost,
      });

      console.log(
        `[DOSAGE-QUEUE] Deducted ${totalCost} credits from user ${userId} for job ${jobId} (${usages.length} usage records)`,
      );
    } catch (error) {
      console.error(
        `[DOSAGE-QUEUE] Failed to deduct credits for job ${jobId}:`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - we don't want to fail the job if credit deduction fails
      // The usage is already logged, so we can retry the deduction later if needed
    }
  }
