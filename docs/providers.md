# AI providers

Allowed `LLM_GATEWAY` values: `ollama`, `openai`, `anthropic`, `openrouter`,
`openai-compatible`. Unknown values fail boot with `INVALID_ENV`.

Discovery (no secrets):

- `GET /llm/providers/detect`
- `GET /llm/models?provider=ollama`

Ollama is the local-first default. Chat smoke uses `qwen3.5:4b`. Embeddings use
`nomic-embed-text` at 768 dimensions. Qdrant collections are namespaced as
`{purpose}_{provider}_{model}_{dimension}`.

Cloud providers need API keys (`OPENAI_API_KEY`, `CLAUDE_API_KEY` or
`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`). `openai-compatible` needs
`OPENAI_COMPATIBLE_BASE_URL`. CI must mock or omit cloud keys; never call paid
APIs from GitHub Actions.
