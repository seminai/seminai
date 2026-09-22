/**
 * Single model selector for integration tests that make real LLM calls.
 *
 * The local-first default is an Ollama model. Phase 8 wires the provider
 * factory and full model matrix; earlier deterministic gates keep live LLM
 * tests outside the public suite.
 */
export const LIVE_TEST_CHAT_MODEL = (process.env.SEMINAI_TEST_LLM_MODEL?.trim() ||
  'qwen3.5:4b') as ChatModelName;
import type { ChatModelName } from '../infrastructure/services/llm-model-validation';
