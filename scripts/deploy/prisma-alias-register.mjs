import { register } from 'node:module';

register(new URL('./prisma-alias-loader.mjs', import.meta.url));
