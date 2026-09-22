export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /**
   * Subset of promptTokens served from the provider's prompt cache.
   * OpenAI: usage.prompt_tokens_details.cached_tokens. Charged at ~50% of
   * the standard input rate on models that support automatic prompt caching.
   */
  readonly cachedPromptTokens: number;
}

export interface UsageAccumulatorProps {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly cachedPromptTokens?: number;
  readonly mistralOcrPages?: number;
  readonly tavilyCalls?: number;
}

export class UsageAccumulator {
  private prompt: number;
  private completion: number;
  private total: number;
  private cachedPrompt: number;
  private mistralPages: number;
  private tavilyCalls: number;

  constructor(initial?: UsageAccumulatorProps) {
    this.prompt = initial?.promptTokens ?? 0;
    this.completion = initial?.completionTokens ?? 0;
    this.total = initial?.totalTokens ?? 0;
    this.cachedPrompt = initial?.cachedPromptTokens ?? 0;
    this.mistralPages = initial?.mistralOcrPages ?? 0;
    this.tavilyCalls = initial?.tavilyCalls ?? 0;
  }

  public add(usage: UsageAccumulatorProps): void {
    this.prompt += usage.promptTokens ?? 0;
    this.completion += usage.completionTokens ?? 0;
    this.total += usage.totalTokens ?? 0;
    this.cachedPrompt += usage.cachedPromptTokens ?? 0;
    this.mistralPages += usage.mistralOcrPages ?? 0;
    this.tavilyCalls += usage.tavilyCalls ?? 0;
  }

  public addMistralOcrPage(): void {
    this.mistralPages += 1;
  }

  public addTavilyCall(): void {
    this.tavilyCalls += 1;
  }

  public getTotals(): TokenUsage {
    return {
      promptTokens: this.prompt,
      completionTokens: this.completion,
      totalTokens: this.total || this.prompt + this.completion,
      cachedPromptTokens: this.cachedPrompt,
    };
  }

  public getMistralOcrPages(): number {
    return this.mistralPages;
  }

  public getTavilyCalls(): number {
    return this.tavilyCalls;
  }
}
