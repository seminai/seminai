import { createHmac } from 'node:crypto';
import type { HttpMcpConfig } from '../http-config.js';
import type { LoginSessionRecord } from './types.js';
export const consentSignature = (key: string, session: string, query: string): string =>
  createHmac('sha256', key).update(`${session}:${query}`).digest('hex');
const escape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export async function renderConsent(
  config: HttpMcpConfig,
  session: LoginSessionRecord,
  id: string,
  query: string,
): Promise<string> {
  const response = await fetch(`${config.apiBaseUrl}/farm/companies`, {
    headers: { authorization: `Bearer ${session.seminaiJwt}` },
  });
  if (!response.ok) throw new Error('Sessione Seminai scaduta');
  const payload = (await response.json()) as { data: Array<{ id: string; name: string }> };
  const csrf = consentSignature(config.oauthSigningKey, id, query);
  return `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizza Seminai MCP</title><body style="font:16px system-ui;max-width:32rem;margin:10vh auto;padding:24px"><h1>Collega Seminai</h1><p>Il client potrà leggere i dati e proporre operazioni per l’azienda scelta. Le registrazioni richiedono sempre conferma dentro Seminai.</p><form method="post" action="/oauth/consent"><input type="hidden" name="return_query" value="${escape(query)}"><input type="hidden" name="csrf" value="${csrf}"><label>Azienda <select name="companyId" required>${payload.data.map((company) => `<option value="${escape(company.id)}">${escape(company.name)}</option>`).join('')}</select></label><p>Puoi revocare il collegamento nelle impostazioni di Seminai.</p><button>Autorizza lettura e proposte</button></form></body></html>`;
}
export async function createScopedGrant(
  config: HttpMcpConfig,
  session: LoginSessionRecord,
  companyId: string,
  clientId: string,
): Promise<LoginSessionRecord> {
  const response = await fetch(`${config.apiBaseUrl}/farm/connections`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.seminaiJwt}`, 'content-type': 'application/json' },
    body: JSON.stringify({ companyId, name: `MCP ${clientId}`.slice(0, 100) }),
  });
  if (!response.ok) throw new Error('Azienda non autorizzata');
  const payload = (await response.json()) as { data: { token: string } };
  return { ...session, seminaiJwt: payload.data.token };
}
