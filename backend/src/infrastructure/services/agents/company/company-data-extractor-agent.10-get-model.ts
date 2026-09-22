import type { ChatOpenAI } from '@langchain/openai';
import { createChatModel } from '../../llm-model-factory';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentGetModel(this: CompanyDataExtractorAgentContext): ChatOpenAI {
    if (!this.model) {
      const { model } = createChatModel({
        modelName: 'gpt-4o-mini',
        temperature: 0,
      });
      this.model = model;
    }
    return this.model;
  }
