import 'dotenv/config';
import { bootstrapInstanceSecrets } from './bootstrapSecrets';
import { validateRuntimeEnv } from './validateRuntimeEnv';
import { resolveRuntimeEntry } from './resolveAppMode';

bootstrapInstanceSecrets();
validateRuntimeEnv();

if (resolveRuntimeEntry() === 'worker') {
  await import('../worker/worker');
} else {
  await import('../http/server');
}
