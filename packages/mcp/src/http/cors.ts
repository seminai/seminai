import type { Request, Response } from 'express';
import type { HttpMcpConfig } from '../http-config.js';

export function applyCors(
  request: Request,
  response: Response,
  allowedOrigins: readonly string[],
): void {
  const origin = request.headers.origin;
  if (
    origin &&
    allowedOrigins.some((allowed) => origin === allowed || origin.endsWith('.claude.ai'))
  ) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  } else if (origin && (origin.endsWith('.chatgpt.com') || origin.endsWith('.openai.com'))) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id',
  );
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD');
  response.setHeader(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id, WWW-Authenticate, MCP-Protocol-Version',
  );
}

export function wwwAuthenticate(config: HttpMcpConfig): string {
  const metadata = `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;
  return `Bearer realm="seminai", resource_metadata="${metadata}", error="invalid_token", error_description="Authentication required"`;
}
