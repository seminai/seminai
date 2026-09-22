import { execAsync } from './client.support';
import type { BdfClientContext } from './client.context';

export async function bdfClientCurlGet(this: BdfClientContext, url: string): Promise<string> {
    const { stdout } = await execAsync(
      `curl -s -H "Authorization: Bearer ${this.accessToken}" -H "Accept: application/json" "${url}"`,
      { encoding: 'utf-8', timeout: 30000 },
    );
    return stdout;
  }
