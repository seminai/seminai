import type { ChatOpenAI } from '@langchain/openai';

export interface JobVerificationGraphFactoryContext {
  readonly model: ChatOpenAI;
  readonly tavilyApiKey?: string;
  readonly userId?: string;
  readonly modelName: string;
}
