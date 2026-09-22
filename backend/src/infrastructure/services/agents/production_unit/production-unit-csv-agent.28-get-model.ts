import type { ChatOpenAI } from '@langchain/openai';
import { createChatModel } from '../../llm-model-factory';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentGetModel(this: ProductionUnitCsvAgentContext): ChatOpenAI {
    if (!this.model) {
      const { model } = createChatModel({
        modelName: 'gpt-4o-mini',
        temperature: 0,
      });
      this.model = model;
    }
    return this.model;
  }
