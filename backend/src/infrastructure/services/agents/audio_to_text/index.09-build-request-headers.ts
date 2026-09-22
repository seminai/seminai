import { buildOpenRouterHeaders } from '../../llm-gateway-headers';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceBuildRequestHeaders(this: AudioToTextServiceContext): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.gatewayConfig.apiKey}`,
    };
    if (this.gatewayConfig.gateway === 'openrouter') {
      Object.assign(
        headers,
        buildOpenRouterHeaders(this.gatewayConfig.referer, this.gatewayConfig.title),
      );
    }
    return headers;
  }
