import type { ChatOpenAI } from '@langchain/openai';
import { createChatModel } from '../../llm-model-factory';
import { VALID_CHAT_MODELS, isValidChatModelName } from '../../llm-model-validation';
import { ChatModel } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';
import { jobVerificationGraphFactoryCreateGraph } from './graph.01-create-graph';

export { type ChatModel, DEFAULT_RECURSION_LIMIT } from './graph.support';
export { VALID_CHAT_MODELS };

/**
 * Factory class for creating the LangGraph agent workflow.
 * Implements human-in-the-loop pattern with interrupt before tool execution.
 */
export class JobVerificationGraphFactory {

  readonly model: ChatOpenAI;
  readonly tavilyApiKey?: string;
  readonly userId?: string;
  readonly modelName: string;

  constructor(
    options: {
      modelName?: ChatModel;
      temperature?: number;
      tavilyApiKey?: string;
      openAIApiKey?: string;
      userId?: string;
    } = {},
  ) {
    const modelName = options.modelName || 'gpt-4o';
    if (!isValidChatModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Must be one of: ${VALID_CHAT_MODELS.join(', ')}`,
      );
    }

    const created = createChatModel({
      modelName,
      temperature: options.temperature ?? 0,
    });

    this.tavilyApiKey = options.tavilyApiKey || process.env.TAVILY_API_KEY;
    this.userId = options.userId;
    this.model = created.model;
    this.modelName = created.modelName;
  }

  /**
   * Creates and compiles the LangGraph workflow with human-in-the-loop support.
   */
  public createGraph() {
    return jobVerificationGraphFactoryCreateGraph.call(this as unknown as JobVerificationGraphFactoryContext);
  }
}
