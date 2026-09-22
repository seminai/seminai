import axios from 'axios';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceScrollByRuleId(this: VectorSearchQdrantServiceContext, workspaceId: string, ruleId: string, limit: number = 20): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>> {
    const url = `${this.url.replace(/\/+$/, '')}/collections/${this.collectionName}/points/scroll`;
    const body = {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.ruleId', match: { value: ruleId } },
          { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
        ],
      },
      limit,
      with_payload: true,
      with_vector: false,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    const response = await axios.post(url, body, { headers, timeout: 15_000 });
    const points: Array<{ payload?: Record<string, unknown> }> =
      response.data?.result?.points ?? [];
    return points.map((p) => {
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      const pageContent = typeof payload.pageContent === 'string' ? payload.pageContent : '';
      const metadata = (payload.metadata as Record<string, unknown>) ?? {};
      return { pageContent, metadata };
    });
  }
