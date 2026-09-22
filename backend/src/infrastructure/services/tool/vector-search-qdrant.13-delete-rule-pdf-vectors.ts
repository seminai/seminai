import axios from 'axios';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceDeleteRulePdfVectors(this: VectorSearchQdrantServiceContext, workspaceId: string, ruleId: string): Promise<void> {
    const url = `${this.url.replace(/\/+$/, '')}/collections/${this.collectionName}/points/delete`;
    const body = {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.ruleId', match: { value: ruleId } },
          { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
        ],
      },
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    try {
      await axios.post(url, body, { headers, params: { wait: true }, timeout: 30_000 });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return;
      }
      throw err;
    }
  }
