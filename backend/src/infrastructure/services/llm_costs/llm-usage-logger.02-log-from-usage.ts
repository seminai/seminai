import { Prisma } from '@prisma/client';
import { CostCalculator, ModelPricingRegistry, TokenUsage } from './usage';
import { LlmUsageMetadata, UsageRecord, DEFAULT_MARGIN, BATCH_SIZE } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerLogFromUsage(this: LlmUsageLoggerContext, tokens: TokenUsage, meta: LlmUsageMetadata): Promise<void> {
    if (!meta.userId) {
      return;
    }
    const pricing = ModelPricingRegistry.getPricing(meta.model);
    const margin = typeof meta.margin === 'number' ? meta.margin : DEFAULT_MARGIN;
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      margin,
    });

    const record: UsageRecord = {
      userId: meta.userId,
      companyId: meta.companyId ?? null,
      jobId: meta.jobId ?? null,
      jobGroupId: meta.jobGroupId ?? null,
      jobType: meta.jobType,
      model: meta.model,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.totalTokens,
      cachedTokens: tokens.cachedPromptTokens,
      cost: cost.totalCostUsd,
      seminaiMargin: margin,
      costClient: cost.costWithMarginUsd,
      metadata: meta.metadata ?? Prisma.JsonNull,
    };

    this.emitAnalytics(tokens, cost.totalCostUsd, meta);
    this.pendingRecords.push(record);

    if (this.pendingRecords.length >= BATCH_SIZE) {
      await this.flush();
    }
  }
