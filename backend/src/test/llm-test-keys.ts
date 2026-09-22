import { hasLlmGatewayKey, hasChatLlmApiKey } from '../infrastructure/services/llm-config';

export { hasLlmGatewayKey, hasChatLlmApiKey };

/** True when chat/vision/embedding LLM integration tests can run. */
export function hasLlmIntegrationKey(): boolean {
  return hasChatLlmApiKey();
}
