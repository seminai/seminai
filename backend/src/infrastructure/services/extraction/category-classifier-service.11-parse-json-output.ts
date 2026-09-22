import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { LlmCategoryOutput } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceParseJsonOutput(this: CategoryClassifierServiceContext, content: string): LlmCategoryOutput | null {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      category?: string;
      confidence?: number;
      reason?: string;
    };
    const allowed = new Set<ResolvedCategory>([
      'fields',
      'production_units',
      'agricultural',
      'invoice',
      'ddt',
      'stock',
    ]);
    if (!parsed.category || !allowed.has(parsed.category as ResolvedCategory)) {
      return null;
    }
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    return {
      category: parsed.category as ResolvedCategory,
      confidence,
      reason: parsed.reason?.slice(0, 220) ?? 'No reason provided',
    };
  }
