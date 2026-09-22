import type { BdfClientContext } from './client.context';

export async function bdfClientRequestText(this: BdfClientContext, endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<string> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    try {
      return await this.curlGet(url.toString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`BDF API error on ${endpoint}: ${msg}`);
    }
  }
