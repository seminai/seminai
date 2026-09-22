import type { ChatOpenAI } from '@langchain/openai';
import type { ModelProvider, TaskComplexity } from '../../shared/modelRouter';
import type { DosageReactState } from '../type/state';

export interface AgentNodeModel {
  readonly modelWithTools: ChatOpenAI;
  readonly modelName: string;
  readonly provider: ModelProvider;
  readonly complexity: TaskComplexity;
}

export interface AgentModelSelectorOptions {
  readonly modelWithTools?: ChatOpenAI;
  readonly models?: Partial<Record<TaskComplexity, AgentNodeModel>>;
  readonly modelName?: string;
}

const HIGH_COMPLEXITY_TOOLS = new Set([
  'calculate_dosage',
  'generate_treatment_plan',
  'validate_compliance',
  'run_conformity_check',
  'confirm_conformity_check',
  'optimize_dosage',
]);

const LOW_COMPLEXITY_TOOLS = new Set([
  'list_user_companies',
  'list_production_units',
  'list_company_products',
  'get_working_memory_details',
  'search_company_stock_products',
  'check_product_crop_authorizations',
]);

export function resolveAgentModels(
  options: AgentModelSelectorOptions,
): Record<TaskComplexity, AgentNodeModel> {
  const fallback = options.models?.medium ?? options.models?.low ?? options.models?.high;
  if (fallback) {
    return {
      low: options.models?.low ?? fallback,
      medium: options.models?.medium ?? fallback,
      high: options.models?.high ?? fallback,
    };
  }
  if (!options.modelWithTools || !options.modelName) {
    throw new Error('createAgentNode requires either models or modelWithTools/modelName');
  }
  const legacyModel: AgentNodeModel = {
    modelWithTools: options.modelWithTools,
    modelName: options.modelName,
    provider: 'openai',
    complexity: 'medium',
  };
  return { low: legacyModel, medium: legacyModel, high: legacyModel };
}

export function selectAgentModel(
  state: DosageReactState,
  successfulToolsThisTurn: readonly string[],
  models: Record<TaskComplexity, AgentNodeModel>,
): AgentNodeModel {
  const lastToolName = state.lastToolCalls[state.lastToolCalls.length - 1];
  if (
    successfulToolsThisTurn.some((toolName) => HIGH_COMPLEXITY_TOOLS.has(toolName)) ||
    HIGH_COMPLEXITY_TOOLS.has(lastToolName)
  ) {
    return models.high;
  }
  if (!lastToolName || LOW_COMPLEXITY_TOOLS.has(lastToolName)) {
    return models.low;
  }
  return models.medium;
}

export function toSelectedModelState(model: AgentNodeModel): DosageReactState['selectedModel'] {
  return {
    provider: model.provider,
    modelName: model.modelName,
    complexity: model.complexity,
  };
}
