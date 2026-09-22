import 'dotenv/config';

/**
 * Generic promptfoo provider for testing task-specific LLM prompts.
 * Loads a prompt template from a .txt file, substitutes {{variables}} from
 * the test dataset, and sends the result to the OpenAI API.
 *
 * Config options:
 *   - model: OpenAI model name (default: "gpt-4o-mini")
 *   - temperature: sampling temperature (default: 0)
 *   - promptFile: relative path to the .txt prompt template (from llm-test/)
 *   - maxTokens: max completion tokens (default: 1024)
 */
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

const templateCache = new Map<string, string>();

function loadTemplate(promptFile: string): string {
  if (templateCache.has(promptFile)) {
    return templateCache.get(promptFile)!;
  }
  const filePath = path.resolve(__dirname, '..', promptFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt template not found at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  templateCache.set(promptFile, content);
  return content;
}

function substituteVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

function stripMarkdownCodeBlocks(text: string): string {
  const stripped = text.replace(/```(?:json)?\s*\n?/g, '').trim();
  return stripped;
}

export default class TaskPromptProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly promptFile: string;
  private readonly maxTokens: number;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'task-prompt';
    this.model = (options.config?.model as string) ?? 'gpt-4o-mini';
    this.temperature = (options.config?.temperature as number) ?? 0;
    this.promptFile = (options.config?.promptFile as string) ?? '';
    this.maxTokens = (options.config?.maxTokens as number) ?? 1024;

    if (!this.promptFile) {
      throw new Error(
        'TaskPromptProvider requires config.promptFile (e.g. "prompts/crop-matcher.txt")',
      );
    }
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const template = loadTemplate(this.promptFile);

    const vars: Record<string, string> = {
      ...(context?.vars as Record<string, string> | undefined),
    };

    const fullPrompt = substituteVariables(template, vars);

    try {
      const response = await fetchChatCompletion({
        model: this.model,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { error: `LLM API error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const rawOutput = data.choices[0].message.content;

      return {
        output: stripMarkdownCodeBlocks(rawOutput),
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
