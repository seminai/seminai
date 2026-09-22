import type { ChatOpenAI } from '@langchain/openai';
import { JobOperationsVectorStore } from './rag';
import { DisciplinariPdfVectorStore } from './rag/DisciplinariPdfVectorStore';
import { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../domain/repositories/IStockRepository';

export interface AgentGraphFactoryContext {
  readonly model: ChatOpenAI;
  readonly tavilyApiKey?: string;
  readonly userId?: string;
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly threadId?: string;
  readonly jobOperationsVectorStore?: JobOperationsVectorStore;
  readonly disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  readonly modelName: string;
  readonly requireApproval: boolean;
  readonly userInfo?: { name: string; email: string };
  readonly jobRepository?: IJobRepository;
  readonly stockRepository?: IStockRepository;
}
