import { prisma } from '../../repositories/Prisma';
import { UsageRecord } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerPersistBatch(this: LlmUsageLoggerContext, records: UsageRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    if (records.length === 1) {
      await this.persistSingleRecord(records[0]);
      return;
    }

    await prisma.$transaction(
      records.map((record) =>
        prisma.llmUsage.create({
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
            cachedTokens: record.cachedTokens,
            cost: record.cost,
            seminaiMargin: record.seminaiMargin,
            costClient: record.costClient,
            metadata: record.metadata,
          },
        }),
      ),
    );
  }
