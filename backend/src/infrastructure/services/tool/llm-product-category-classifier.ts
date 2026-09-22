import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { createChatModel } from '../llm-model-factory';
import { hasChatLlmApiKey } from '../llm-config';

type ProductCategoryLabel = 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER';

type ClassificationRow = {
  readonly productName: string;
  readonly category: ProductCategoryLabel;
};

const DEFAULT_MODEL_NAME = 'gpt-4o-mini';
const MAX_NAMES_PER_BATCH = 100;

const PROMPT_TEMPLATE = `
You classify Italian agronomic product names into exactly one category:
- PHYTOSANITARY: pesticides / plant protection products
- FERTILIZER: fertilizers, soil improvers, nutrients
- OTHER: anything else or uncertain

Rules:
- Use only product names provided.
- Never invent product names.
- Keep the original productName in output.
- If uncertain between PHYTOSANITARY and OTHER, choose OTHER.
- Return strictly JSON.

Product names:
{product_names}

{format_instructions}
`;

export class LlmProductCategoryClassifier {
  private readonly chain: {
    invoke: (input: {
      product_names: string;
      format_instructions: string;
    }) => Promise<ReadonlyArray<ClassificationRow>>;
  };

  private readonly formatInstructions: string;

  constructor(modelName: string = process.env.OPENAI_MODEL_CLASSIFIER ?? DEFAULT_MODEL_NAME) {
    const parser = new JsonOutputParser<ReadonlyArray<ClassificationRow>>();
    const prompt = PromptTemplate.fromTemplate(PROMPT_TEMPLATE);
    const { model: llm } = createChatModel({
      modelName,
      temperature: 0,
      maxTokens: 2000,
      timeout: 60_000,
    });
    this.chain = prompt.pipe(llm).pipe(parser);
    this.formatInstructions = parser.getFormatInstructions();
  }

  public async classifyProductNames(params: {
    productNames: ReadonlyArray<string>;
  }): Promise<ReadonlyMap<string, ProductCategoryLabel>> {
    if (!hasChatLlmApiKey()) {
      return new Map();
    }
    const uniqueNames = Array.from(
      new Set(
        params.productNames
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
          .slice(0, MAX_NAMES_PER_BATCH),
      ),
    );
    if (uniqueNames.length === 0) {
      return new Map();
    }
    const bulletList = uniqueNames.map((name) => `- ${name}`).join('\n');
    try {
      const rows = await this.chain.invoke({
        product_names: bulletList,
        format_instructions: this.formatInstructions,
      });
      const mapped = new Map<string, ProductCategoryLabel>();
      for (const row of rows) {
        const normalizedName = this.normalizeName(row.productName);
        if (!normalizedName) {
          continue;
        }
        mapped.set(normalizedName, this.normalizeCategory(row.category));
      }
      return mapped;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown LLM classification error';
      console.warn(`[PRODUCT_CATEGORY_LLM] Classification failed: ${reason}`);
      return new Map();
    }
  }

  private normalizeName(name: string): string {
    return name.trim().toUpperCase();
  }

  private normalizeCategory(category: string): ProductCategoryLabel {
    if (category === 'PHYTOSANITARY' || category === 'FERTILIZER' || category === 'OTHER') {
      return category;
    }
    return 'OTHER';
  }
}
