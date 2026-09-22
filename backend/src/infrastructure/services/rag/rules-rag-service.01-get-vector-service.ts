import { createVectorSearchQdrantService, VectorSearchQdrantService } from '../tool/vectorSearchQdrant';
import { resolveRulesQdrantCollection } from '../llm/qdrantNamespace';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceGetVectorService(this: RulesRagServiceContext): VectorSearchQdrantService {
    if (!this.vectorService) {
      this.vectorService = createVectorSearchQdrantService(resolveRulesQdrantCollection());
    }
    return this.vectorService;
  }
