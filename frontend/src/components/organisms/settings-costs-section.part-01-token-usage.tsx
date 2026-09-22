

export interface TokenUsage {
  readonly id: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costClient: number;
  readonly createdAt: string;
  readonly companyName?: string;
}

export interface TokenCostsResponse {
  readonly status: string;
  readonly data: {
    readonly usages: readonly TokenUsage[];
    readonly totals: {
      readonly totalCostClient: number;
      readonly totalPromptTokens: number;
      readonly totalCompletionTokens: number;
      readonly totalTokens: number;
    };
  };
}

export const MODEL_COLORS: Record<string, string> = {
  'gpt-4o': '#10b981',
  'gpt-4o-mini': '#6366f1',
  'gpt-4': '#f59e0b',
  'gpt-3.5-turbo': '#ef4444',
  'claude-3-opus': '#8b5cf6',
  'claude-3-sonnet': '#3b82f6',
  'claude-3-haiku': '#14b8a6',
};

export function getModelColor(model: string, idx: number): string {
  const fallback = [
    '#10b981',
    '#6366f1',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#3b82f6',
    '#14b8a6',
    '#f97316',
  ];
  return MODEL_COLORS[model] ?? fallback[idx % fallback.length] ?? '#888888';
}
