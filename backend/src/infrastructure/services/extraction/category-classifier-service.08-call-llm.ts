import { createChatModel } from '../llm-model-factory';
import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type FileFormat } from './file-format-resolver';
import { LlmCategoryOutput, DEFAULT_MODEL_NAME } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export async function categoryClassifierServiceCallLlm(this: CategoryClassifierServiceContext, input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): Promise<LlmCategoryOutput> {
    if (this.options.llmInvoker) {
      return this.options.llmInvoker(this.buildPrompt(input));
    }
    const { model: llm } = createChatModel({
      modelName: DEFAULT_MODEL_NAME,
      temperature: 0,
      maxTokens: 150,
      timeout: Number(process.env.CATEGORY_CLASSIFIER_TIMEOUT_MS ?? 4000),
    });
    const rawResponse = await llm.invoke(this.buildPrompt(input));
    const content = Array.isArray(rawResponse.content)
      ? rawResponse.content.map((part) => ('text' in part ? part.text : '')).join('\n')
      : String(rawResponse.content ?? '');
    const parsed = this.parseJsonOutput(content);
    if (!parsed) {
      throw new Error('LLM output is not a valid JSON classification');
    }
    return parsed;
  }
