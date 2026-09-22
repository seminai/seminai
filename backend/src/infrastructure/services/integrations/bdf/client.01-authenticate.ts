import type { BdfAuthResponse } from './types';
import { execAsync } from './client.support';
import type { BdfClientContext } from './client.context';

export async function bdfClientAuthenticate(this: BdfClientContext): Promise<string> {
    const authUrl = `${this.baseUrl}/rest/bdf/auth`;

    console.log(`[BDF] Authenticating to ${authUrl} (user: ${this.username})`);

    // Use curl via child_process — the BDF WiRL/Delphi server is case-sensitive
    // and rejects lowercase "authorization" headers (HTTP/2 lowercases them).
    // curl preserves header casing. We use async exec to avoid blocking the event loop.
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    let responseText: string;
    try {
      const { stdout } = await execAsync(
        `curl -s -X POST -H "Authorization: Basic ${credentials}" -H "Accept: application/json" "${authUrl}"`,
        { encoding: 'utf-8', timeout: 15000 },
      );
      responseText = stdout;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`BDF auth network error: ${msg}`);
    }

    let data: BdfAuthResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`BDF auth failed: invalid response - ${responseText}`);
    }

    if ('status' in data && (data as Record<string, unknown>).status !== 200 && !data.success) {
      throw new Error(`BDF auth failed: ${responseText}`);
    }
    if (!data.success || !data.access_token) {
      throw new Error('BDF auth failed: invalid response');
    }

    this.accessToken = data.access_token;
    return data.access_token;
  }
