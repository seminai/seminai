import path from 'node:path';
import { pathToFileURL } from 'node:url';

const generatedClient = pathToFileURL(
  path.resolve(process.env.BACKEND_ROOT || process.cwd(), 'dist/generated/prisma/client.js'),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@prisma/client') {
    return { shortCircuit: true, url: generatedClient, format: 'module' };
  }
  return nextResolve(specifier, context);
}
