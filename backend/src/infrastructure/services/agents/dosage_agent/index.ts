// Types
export type {
  FindLabelExtractionInputWithDosage,
  OrchestratorConfig,
  InputDosageAgent,
  RunFlowsOptions,
  RawUnitOfProduction,
  ExcludedProduct,
  ProductSelectionResult,
  OperationMachine,
  OperationOperator,
} from './types';

// Main flows
export { runFlows, runFlowsMultiCompany } from './runFlows';

// SA Group Limits Validation
export { flowValidateSAGroupLimits } from './saGroupLimitsValidator';

// Production cycles
export { expandUnitOfProductionWithCycles } from './productionCycleExpander';

// Company grouping
export { groupUnitsByCompany } from './companyGrouper';

// Stock balance utilities
export {
  calculateStockBalance,
  printStockBalanceReport,
  flowOptimizeDosageLinearFunc,
  type DosageStrategy,
  type StockBalanceReport,
  type ProductStockBalance,
} from './flowMatchProductionUnitTreatmentDosage';

// Circuit breaker for LLM resilience
export {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from './circuitBreaker';

// LLM error handling
export {
  LlmErrorType,
  classifyLlmError,
  executeLlmCallWithProtection,
  createLlmWarning,
  type LlmError,
  type LlmCallResult,
  type LlmWarning,
} from './llmErrorHandler';

// Batch loading utilities
export {
  BatchLoaderContext,
  batchLoadProductionUnitsWithCycles,
  batchLoadProductionUnitMetadata,
  resolveCycleIdFromCache,
  type ProductionUnitWithCycles,
  type ProductionUnitMetadata,
} from './batchLoader';

// Field buffer zone extraction
export {
  extractFieldBufferZones,
  applyFieldBufferZoneReduction,
  clearFieldBufferZoneCache,
  BufferZoneTypeEnum,
  type FieldBufferZoneResult,
  type BufferZoneType,
} from './fieldBufferZoneExtractor';

// Revoked product checking
export {
  checkProductRevoked,
  checkProductsBatchRevoked,
  buildRevokedExclusionMessage,
  isRevokedDatasetAvailable,
  getRevokedDatasetWarning,
  type RevokedProductInfo,
  type RevokeCheckResult,
} from './revokedProductChecker';

// Treatment strategy planner (cross-product coordination)
export {
  planTreatmentStrategy,
  type TreatmentStrategyHint,
  type TreatmentStrategyPlan,
} from './treatmentStrategyPlanner';

// BDF dosage enrichment
export { enrichDosageDetailsFromBdf, buildBdfFallbackLabel } from './bdfDosageEnricher';

// LLM Provider with Claude/OpenAI fallback
export {
  LlmProvider,
  callWithFallback,
  resolveProvider,
  extractResponseText,
  getFallbackStats,
  type LlmOperation,
  type LlmCallWithFallbackResult,
  type LlmModelOptions,
} from './llmProvider';
