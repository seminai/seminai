import { defineConfig } from 'orval';

export default defineConfig({
  seminai: {
    input: {
      target: '../backend/openapi/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/generated/api',
      schemas: './src/generated/schemas',
      client: 'react-query',
      httpClient: 'fetch',
      override: {
        mutator: {
          path: './src/lib/api-client.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
  },
});
