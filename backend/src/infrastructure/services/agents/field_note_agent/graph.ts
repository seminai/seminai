import { MemorySaver, BaseCheckpointSaver } from '@langchain/langgraph';
import type { ChatOpenAI } from '@langchain/openai';
import { PrismaClient } from '@prisma/client';
import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { createChatModel } from '../../llm-model-factory';
import { VALID_CHAT_MODELS, isValidChatModelName } from '../../llm-model-validation';
import { FieldNoteAgentGraphFactoryOptions } from './graph.support';
import type { FieldNoteAgentGraphFactoryContext } from './graph.context';
import { fieldNoteAgentGraphFactoryCreateGraph } from './graph.01-create-graph';

export { prependFieldNoteSystemPrompt, pendingActionReducer, type ChatModel, type FieldNoteAgentGraphFactoryOptions, createFieldNoteGuardNode } from './graph.support';

export class FieldNoteAgentGraphFactory {

  readonly model: ChatOpenAI;
  readonly userId: string;
  readonly prisma: PrismaClient;
  readonly openAIApiKey?: string;
  readonly modelName: string;
  readonly checkpointer: BaseCheckpointSaver;
  readonly threadId: string;

  /**
   * Creates a new FieldNoteAgentGraphFactory instance.
   * @param options Configuration options for the agent
   */
  constructor(options: FieldNoteAgentGraphFactoryOptions) {
    const modelName = options.modelName || 'gpt-4o';
    const openAIApiKey = options.openAIApiKey || process.env.OPENAI_API_KEY;

    if (!isValidChatModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Must be one of: ${VALID_CHAT_MODELS.join(', ')}`,
      );
    }

    const created = createChatModel({
      modelName,
      temperature: options.temperature ?? 0.1,
    });
    this.model = created.model;

    this.userId = options.userId;
    this.prisma = options.prisma;
    this.openAIApiKey = openAIApiKey;
    this.modelName = created.modelName;
    this.checkpointer = options.checkpointer ?? new MemorySaver();
    this.threadId = options.threadId ?? 'default';
  }

  /**
   * Creates and compiles the LangGraph workflow with human-in-the-loop support.
   * The graph will interrupt before save/stock tools to allow human approval.
   * Analysis tools (classify, find_*) run automatically without approval.
   */
  public createGraph(): FieldNoteAgentApp {
    return fieldNoteAgentGraphFactoryCreateGraph.call(this as unknown as FieldNoteAgentGraphFactoryContext);
  }
}
