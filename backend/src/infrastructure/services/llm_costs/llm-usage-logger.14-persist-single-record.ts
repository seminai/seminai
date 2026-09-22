import { prisma } from '../../repositories/Prisma';
import { UsageRecord } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerPersistSingleRecord(this: LlmUsageLoggerContext, record: UsageRecord): Promise<void> {
    await prisma.llmUsage.create({
      data: {
        user: { connect: { id: record.userId } },
        company: record.companyId ? { connect: { id: record.companyId } } : undefined,
        jobId: record.jobId,
        jobGroupId: record.jobGroupId,
        jobType: record.jobType,
        model: record.model,
        promptTokens: record.promptTokens,
        completionTokens: record.completionTokens,
        totalTokens: record.totalTokens,
        cost: record.cost,
        seminaiMargin: record.seminaiMargin,
        costClient: record.costClient,
        metadata: record.metadata,
      },
    });
  }
