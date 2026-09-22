import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { ChatOpenAI } from '@langchain/openai';
import { PrismaClient } from '@prisma/client';
import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';

export interface FieldNoteAgentGraphFactoryContext {
  readonly model: ChatOpenAI;
  readonly userId: string;
  readonly prisma: PrismaClient;
  readonly openAIApiKey?: string;
  readonly modelName: string;
  readonly checkpointer: BaseCheckpointSaver;
  readonly threadId: string;
  createGraph(): FieldNoteAgentApp;
}
