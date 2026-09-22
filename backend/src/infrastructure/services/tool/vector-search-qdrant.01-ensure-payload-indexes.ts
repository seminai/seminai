import axios from 'axios';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceEnsurePayloadIndexes(this: VectorSearchQdrantServiceContext): Promise<void> {
    const fieldNames = [
      'metadata.ruleId',
      'metadata.workspaceId',
      'metadata.sourceType',
      'metadata.category',
      'metadata.region',
    ];

    console.log(`[VectorSearchQdrant] Ensuring payload indexes for ${this.collectionName}...`);

    for (const fieldName of fieldNames) {
      try {
        await axios.put(
          `${this.url}/collections/${this.collectionName}/index`,
          {
            field_name: fieldName,
            field_schema: 'keyword',
          },
          {
            headers: {
              'api-key': this.apiKey,
              'Content-Type': 'application/json',
            },
            params: { wait: true },
          },
        );
        console.log(`[VectorSearchQdrant] Created index for ${fieldName}`);
      } catch (error: unknown) {
        // Ignore 409 conflict (index already exists)
        const responseData = axios.isAxiosError(error) ? error.response?.data : undefined;
        const responseMessage =
          responseData && typeof responseData === 'object' && 'status' in responseData
            ? JSON.stringify(responseData.status)
            : error instanceof Error
              ? error.message
              : 'Unknown error';
        if (!axios.isAxiosError(error) || error.response?.status !== 409) {
          console.warn(
            `[VectorSearchQdrant] Failed to create index for ${fieldName}: ${responseMessage}`,
          );
        }
      }
    }
  }
