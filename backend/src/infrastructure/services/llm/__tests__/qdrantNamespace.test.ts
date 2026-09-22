import {
  buildQdrantCollectionName,
  embeddingDimensionFor,
  OLLAMA_EMBEDDING_DIMENSION,
  resolveRulesQdrantCollection,
} from '../qdrantNamespace';
import { resolveLocalFirstEmbeddings } from '../localFirstEmbeddings';
import { createEmbeddings } from '../../llm-embeddings-factory';

describe('local-first embeddings and Qdrant namespaces', () => {
  const previousGateway = process.env.LLM_GATEWAY;
  const previousEmbedding = process.env.LLM_EMBEDDING_MODEL;

  afterEach(() => {
    if (previousGateway === undefined) delete process.env.LLM_GATEWAY;
    else process.env.LLM_GATEWAY = previousGateway;
    if (previousEmbedding === undefined) delete process.env.LLM_EMBEDDING_MODEL;
    else process.env.LLM_EMBEDDING_MODEL = previousEmbedding;
  });

  it('uses nomic-embed-text at 768 dimensions on Ollama', () => {
    const config = resolveLocalFirstEmbeddings({ LLM_GATEWAY: 'ollama' });
    expect(config?.modelName).toBe('nomic-embed-text');
    expect(config?.dimension).toBe(OLLAMA_EMBEDDING_DIMENSION);
    expect(config?.baseUrl).toContain('/v1');
    process.env.LLM_GATEWAY = 'ollama';
    const created = createEmbeddings();
    expect(created.modelName).toBe('nomic-embed-text');
    expect(created.dimension).toBe(768);
  });

  it('namespaces Qdrant collections by provider, model, and size', () => {
    expect(
      buildQdrantCollectionName({
        purpose: 'rules',
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimension: 768,
      }),
    ).toBe('rules_ollama_nomic-embed-text_768');
    expect(embeddingDimensionFor('ollama', 'nomic-embed-text')).toBe(768);
    expect(resolveRulesQdrantCollection({ LLM_GATEWAY: 'ollama' })).toBe(
      'rules_ollama_nomic-embed-text_768',
    );
  });
});
