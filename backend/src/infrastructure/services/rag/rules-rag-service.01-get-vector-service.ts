import { createVectorSearchQdrantService, VectorSearchQdrantService } from '../tool/vectorSearchQdrant';
import { RULES_QDRANT_COLLECTION } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceGetVectorService(this: RulesRagServiceContext): VectorSearchQdrantService {
    if (!this.vectorService) {
      this.vectorService = createVectorSearchQdrantService(RULES_QDRANT_COLLECTION);
    }
    return this.vectorService;
  }
