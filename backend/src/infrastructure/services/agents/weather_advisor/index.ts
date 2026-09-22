import { prisma } from '../../../repositories/Prisma';
import { PrismaWeatherAdvisorCacheRepository } from '../../../repositories/PrismaWeatherAdvisorCacheRepository';
import { WeatherAdvisorService } from './WeatherAdvisorService';

export { WeatherAdvisorService } from './WeatherAdvisorService';
export { computeContextHash, type AdviseForInput } from './WeatherAdvisorService';
export type { ProductSummary, MachineSummary } from './prompts/agronomist-system-prompt';

/**
 * Process-wide singleton wired to the real Prisma cache repository.
 * Tools should consume this directly. Tests can construct their own
 * `WeatherAdvisorService` with mocked dependencies.
 */
export const weatherAdvisorService = new WeatherAdvisorService({
  cacheRepo: new PrismaWeatherAdvisorCacheRepository(prisma),
});
