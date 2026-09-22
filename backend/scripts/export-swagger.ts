import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { swaggerSpec } from '../src/infrastructure/http/swagger';
import { swaggerExtractApiSpec } from '../src/infrastructure/http/swagger-extract-api';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const publicApiOutputPath = resolve(currentDir, '../openapi/openapi.json');
const extractApiOutputPath = resolve(currentDir, '../openapi/extract-api.json');
mkdirSync(resolve(currentDir, '../openapi'), { recursive: true });
writeFileSync(publicApiOutputPath, JSON.stringify(swaggerSpec, null, 2));
writeFileSync(extractApiOutputPath, JSON.stringify(swaggerExtractApiSpec, null, 2));
console.log(`Swagger spec exported to ${publicApiOutputPath}`);
console.log(`Extraction API spec exported to ${extractApiOutputPath}`);
