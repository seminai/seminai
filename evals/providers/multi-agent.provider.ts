/**
 * Custom promptfoo provider for testing multi-agent coordination.
 * Injects a multi-agent context block into the user message before
 * sending to OpenAI with the system prompt.
 *
 * Run `npx tsx llm-test/scripts/generate-prompt.ts` before using.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from 'promptfoo';
import { fetchChatCompletion } from '../../backend/src/infrastructure/services/llm-chat-completion-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GeneratedPrompts {
  readonly allFeatures: string;
  readonly minimalFeatures: string;
  readonly generatedAt: string;
}

function loadGeneratedPrompt(): GeneratedPrompts {
  const filePath = path.resolve(__dirname, '..', '.generated', 'system-prompt.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `System prompt not found at ${filePath}. Run: npx tsx llm-test/scripts/generate-prompt.ts`,
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeneratedPrompts;
}

export default class MultiAgentProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly temperature: number;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'dosage-multi-agent';
    this.model = (options.config?.model as string) ?? 'gpt-4o';
    this.temperature = (options.config?.temperature as number) ?? 0;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const generated = loadGeneratedPrompt();
    const systemPromptText = generated.allFeatures;
    const multiAgentContext = (context?.vars?.multi_agent_context as string) ?? '';

    // Augment user message with multi-agent context
    const userMessage = multiAgentContext ? `${multiAgentContext}\n\n${prompt}` : prompt;

    try {
      const response = await fetchChatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: systemPromptText },
          { role: 'user', content: userMessage },
        ],
        temperature: this.temperature,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { error: `LLM API error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        output: data.choices[0].message.content,
        tokenUsage: {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        },
      };
    } catch (err) {
      return { error: `Provider error: ${(err as Error).message}` };
    }
  }
}
