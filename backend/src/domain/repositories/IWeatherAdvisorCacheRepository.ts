import type { TreatmentThresholds } from '../services/treatment-weather/thresholds';

export interface CachedAgronomistAdvice {
  readonly contextHash: string;
  readonly thresholds: TreatmentThresholds;
  readonly reasoning: string | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly sourceModel: string;
}

export interface AgronomistCacheSavePayload {
  readonly contextHash: string;
  readonly thresholds: TreatmentThresholds;
  readonly reasoning: string | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly sourceModel: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export interface IWeatherAdvisorCacheRepository {
  findByContextHash(contextHash: string): Promise<CachedAgronomistAdvice | null>;
  save(entry: AgronomistCacheSavePayload): Promise<void>;
}
