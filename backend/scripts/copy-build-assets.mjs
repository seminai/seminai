import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/infrastructure/services/llm_costs', { recursive: true });
for (const name of ['llm_cost.json', 'openrouter_pricing.json'])
  await cp(
    `src/infrastructure/services/llm_costs/${name}`,
    `dist/infrastructure/services/llm_costs/${name}`,
  );
await cp('src/infrastructure/http/public', 'dist/infrastructure/http/public', { recursive: true });

for (const name of ['prisma-alias-loader.mjs', 'prisma-alias-register.mjs'])
  await cp(`../scripts/deploy/${name}`, name);
