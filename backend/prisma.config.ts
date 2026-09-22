import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const FALLBACK_DATABASE_URL = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'] || process.env['DATABASE_URL'] || FALLBACK_DATABASE_URL,
  },
});
