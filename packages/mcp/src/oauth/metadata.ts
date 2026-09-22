import type { HttpMcpConfig } from '../http-config.js';

export function oauthAuthorizationServerMetadata(config: HttpMcpConfig): Record<string, unknown> {
  return {
    issuer: config.publicBaseUrl,
    authorization_endpoint: `${config.publicBaseUrl}/oauth/authorize`,
    token_endpoint: `${config.publicBaseUrl}/oauth/token`,
    registration_endpoint: `${config.publicBaseUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['seminai'],
    resource_indicators_supported: true,
  };
}

export function oauthProtectedResourceMetadata(config: HttpMcpConfig): Record<string, unknown> {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.publicBaseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['seminai'],
  };
}
