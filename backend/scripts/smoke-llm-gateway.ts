/**
 * Smoke test for the LLM gateway (chat, vision, embeddings).
 * Run: npx tsx scripts/smoke-llm-gateway.ts
 */
import { createChatModel } from '../src/infrastructure/services/llm-model-factory';
import { createEmbeddings } from '../src/infrastructure/services/llm-embeddings-factory';
import { fetchVisionCompletion } from '../src/infrastructure/services/llm-vision-client';
import { hasLlmGatewayKey } from '../src/infrastructure/services/llm-config';

async function smokeChat(): Promise<void> {
  const { model, modelName } = createChatModel({ modelName: undefined, temperature: 0 });
  const response = await model.invoke('Reply with exactly: ok');
  const text = typeof response.content === 'string' ? response.content : String(response.content);
  console.log(`[smoke] chat (${modelName}): ${text.slice(0, 80)}`);
}

async function smokeEmbeddings(): Promise<void> {
  const { embeddings, modelName } = createEmbeddings();
  const vector = await embeddings.embedQuery('smoke test embedding');
  console.log(`[smoke] embeddings (${modelName}): dim=${vector.length}`);
}

async function smokeVision(): Promise<void> {
  const result = await fetchVisionCompletion({
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Reply with exactly: ok' }],
      },
    ],
    maxTokens: 16,
    temperature: 0,
  });
  console.log(`[smoke] vision (${result.model}): ${result.content.slice(0, 80)}`);
}

async function main(): Promise<void> {
  if (!hasLlmGatewayKey()) {
    console.error('Missing OPENROUTER_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY');
    process.exit(1);
  }
  console.log('Running LLM gateway smoke tests...');
  await smokeChat();
  await smokeEmbeddings();
  await smokeVision();
  console.log('All smoke tests passed.');
}

main().catch((error: unknown) => {
  console.error('[smoke-llm-gateway] Failed:', error);
  process.exit(1);
});
