import type { Request, Response } from 'express';
import { GetLabelTextProvider } from '../../services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../services/tool/extractLabel.adapter';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { BulkExtractLabelsUseCase } from '../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { CostCalculator, LangChainUsageCollector, OpenAiPricingRegistry, UsageAccumulator } from '../../services/llm_costs/usage';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerBulkExtract(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const body = request.body as {
      items?: Array<{ name?: string; regNumber?: string }>;
      concurrency?: number;
    };
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      throw AppError.badRequest('Body malformato: items[] richiesto', 'MISSING_ITEMS');
    }

    const repo = new PrismaLabelExtractionRepository(prisma);
    const textProvider = new GetLabelTextProvider();
    const extractor = new ExtractLabelAdapter();
    const useCase = new BulkExtractLabelsUseCase(repo, textProvider, extractor);

    const normalized = items.map((it) => ({
      name: String(it?.name ?? '').trim(),
      regNumber: String(it?.regNumber ?? '').trim(),
    }));
    // Setup token usage tracking and pricing
    const usage = new UsageAccumulator();
    const collector = new LangChainUsageCollector(usage);
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const pricing = OpenAiPricingRegistry.getPricing(model);
    const outcome = await useCase.execute({
      items: normalized,
      concurrency: body?.concurrency,
      callbacks: [collector],
      usageAccumulator: usage,
    });
    const tokens = usage.getTotals();
    const mistralOcrPages = usage.getMistralOcrPages();
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      mistralOcrPages,
      margin: 0.2,
    });
    return response.json({ status: 'success', data: outcome, cost });
  }
