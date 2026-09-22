import type { BdfClientContext } from './client.context';

export async function bdfClientRequest<T>(this: BdfClientContext, endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
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

    let responseText: string;
    try {
      responseText = await this.curlGet(url.toString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`BDF API error on ${endpoint}: ${msg}`);
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new Error(`BDF API invalid JSON on ${endpoint}: ${responseText.slice(0, 200)}`);
    }
  }
